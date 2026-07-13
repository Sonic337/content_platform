"use client";

import { useEffect, useState, useCallback } from "react";
import { tierColors } from "@/lib/tierColor";
import { supabase } from "@/lib/supabaseClient";

const PLATFORMS = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram_reels", label: "Instagram Reels" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "x", label: "X (Twitter)" },
  { value: "linkedin", label: "LinkedIn" },
];

function statusColors(status) {
  switch (status) {
    case "approved": return { border: "#C98A3E", text: "#D9A257" };
    case "published": return { border: "#4C9A6A", text: "#5FA97D" };
    default: return { border: "#7C8489", text: "#7C8489" };
  }
}

const mono = { fontFamily: "var(--font-ibm-plex-mono)" };
const serif = { fontFamily: "var(--font-fraunces)" };
const sans = { fontFamily: "var(--font-ibm-plex-sans)" };

const inputStyle = {
  ...mono,
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "3px",
  border: "1px solid #232B31",
  backgroundColor: "#171D21",
  padding: "8px 10px",
  fontSize: "13px",
  color: "#E8E6DE",
  outline: "none",
  resize: "vertical",
};

const selectStyle = {
  ...mono,
  borderRadius: "3px",
  border: "1px solid #232B31",
  backgroundColor: "#171D21",
  padding: "6px 10px",
  fontSize: "12px",
  color: "#E8E6DE",
  cursor: "pointer",
  width: "100%",
};

const labelStyle = {
  ...mono,
  display: "block",
  marginBottom: "5px",
  fontSize: "10px",
  color: "#7C8489",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

// ── Single run card ──────────────────────────────────────────────────────────

function RunCard({ run, onUpdated }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedHook, setSelectedHook] = useState(run.selected_hook ?? "");
  const [selectedTitle, setSelectedTitle] = useState(run.selected_title ?? "");
  const [saving, setSaving] = useState(false);

  const colors = statusColors(run.status);
  const hooks = Array.isArray(run.hook_options) ? run.hook_options : [];
  const titles = Array.isArray(run.title_options) ? run.title_options : [];
  const displayTitle = run.selected_title || titles[0] || run.input_text?.slice(0, 80) || "Untitled";

  async function updateRun(patch) {
    setSaving(true);
    const { data } = await supabase
      .from("pipeline_runs")
      .update(patch)
      .eq("id", run.id)
      .select()
      .single();
    setSaving(false);
    if (data) onUpdated(data);
  }

  async function saveSelections() {
    await updateRun({ selected_hook: selectedHook, selected_title: selectedTitle });
  }

  return (
    <div
      style={{
        borderLeft: `3px solid ${colors.border}`,
        borderRadius: 0,
        borderBottom: "1px solid #232B31",
        backgroundColor: "#171D21",
      }}
    >
      {/* ── Summary row ── */}
      <div
        style={{ padding: "14px 16px", cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div
          style={{ ...serif, fontSize: "15px", lineHeight: "1.55", color: "#E8E6DE", marginBottom: "7px" }}
        >
          {displayTitle}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", ...mono, fontSize: "11px" }}>
          <span style={{ color: "#7C8489" }}>{run.target_platform}</span>
          <span style={{ color: colors.text }}>{run.status}</span>
          <span style={{ color: "#7C8489" }}>
            {run.created_at ? new Date(run.created_at).toLocaleDateString() : ""}
          </span>
          <span style={{ color: "#7C8489" }}>{expanded ? "▲ collapse" : "▼ expand"}</span>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ padding: "0 16px 20px" }}>
          <div style={{ borderTop: "1px solid #232B31", paddingTop: "16px" }}>

            {/* Thumbnail */}
            {run.thumbnail_url && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ ...labelStyle, marginBottom: "8px" }}>Thumbnail</div>
                <img
                  src={run.thumbnail_url}
                  alt="thumbnail"
                  style={{ maxWidth: "320px", width: "100%", display: "block" }}
                />
              </div>
            )}

            {/* Script */}
            <div style={{ marginBottom: "20px" }}>
              <div style={labelStyle}>Script</div>
              {Array.isArray(run.script_segments) && run.script_segments.length > 0 ? (
                <div>
                  {run.script_segments.map((seg, i) => {
                    const startMin = Math.floor(seg.start_sec / 60);
                    const startSec = String(seg.start_sec % 60).padStart(2, "0");
                    const endMin = Math.floor(seg.end_sec / 60);
                    const endSec = String(seg.end_sec % 60).padStart(2, "0");
                    const ts = `${startMin}:${startSec}–${endMin}:${endSec}`;
                    return (
                      <div
                        key={i}
                        style={{
                          borderBottom: "1px solid #232B31",
                          padding: "10px 0",
                        }}
                      >
                        <div style={{ display: "flex", gap: "10px", alignItems: "baseline", marginBottom: "5px" }}>
                          <span style={{ ...mono, fontSize: "11px", color: "#7C8489" }}>{ts}</span>
                          <span style={{ ...mono, fontSize: "10px", color: "#7C8489", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            {seg.label}
                          </span>
                        </div>
                        <div style={{ ...serif, fontSize: "14px", lineHeight: "1.65", color: "#E8E6DE" }}>
                          {seg.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Fallback for rows created before script_segments was added
                <div
                  style={{
                    ...serif,
                    fontSize: "14px",
                    lineHeight: "1.7",
                    color: "#E8E6DE",
                    whiteSpace: "pre-wrap",
                    borderLeft: "2px solid #232B31",
                    paddingLeft: "12px",
                  }}
                >
                  {run.script}
                </div>
              )}
            </div>

            {/* Hook options */}
            {hooks.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={labelStyle}>Hook options — select one</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {hooks.map((h, i) => {
                    const val = h.hook_text;
                    const checked = selectedHook === val;
                    return (
                      <label
                        key={i}
                        style={{
                          display: "flex",
                          gap: "10px",
                          alignItems: "flex-start",
                          cursor: "pointer",
                          padding: "8px 10px",
                          border: `1px solid ${checked ? "#C98A3E" : "#232B31"}`,
                          borderRadius: "2px",
                        }}
                      >
                        <input
                          type="radio"
                          name={`hook-${run.id}`}
                          value={val}
                          checked={checked}
                          onChange={() => setSelectedHook(val)}
                          style={{ marginTop: "2px", flexShrink: 0 }}
                        />
                        <span>
                          <span style={{ ...serif, fontSize: "13px", color: "#E8E6DE" }}>{val}</span>
                          <span style={{ ...mono, fontSize: "10px", color: "#7C8489", marginLeft: "8px" }}>
                            {h.source}
                          </span>
                          {h.evidence_tier && (
                            <span style={{ ...mono, fontSize: "10px", color: tierColors(h.evidence_tier).text, marginLeft: "8px" }}>
                              {h.evidence_tier}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Title options */}
            {titles.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={labelStyle}>Title options — select one</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {titles.map((t, i) => {
                    const checked = selectedTitle === t;
                    return (
                      <label
                        key={i}
                        style={{
                          display: "flex",
                          gap: "10px",
                          alignItems: "flex-start",
                          cursor: "pointer",
                          padding: "8px 10px",
                          border: `1px solid ${checked ? "#C98A3E" : "#232B31"}`,
                          borderRadius: "2px",
                        }}
                      >
                        <input
                          type="radio"
                          name={`title-${run.id}`}
                          value={t}
                          checked={checked}
                          onChange={() => setSelectedTitle(t)}
                          style={{ marginTop: "2px", flexShrink: 0 }}
                        />
                        <span style={{ ...serif, fontSize: "13px", color: "#E8E6DE" }}>{t}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
              <button
                onClick={saveSelections}
                disabled={saving}
                style={{
                  ...mono,
                  borderRadius: "3px",
                  border: "1px solid #232B31",
                  backgroundColor: "transparent",
                  padding: "5px 14px",
                  fontSize: "11px",
                  color: saving ? "#7C8489" : "#E8E6DE",
                  cursor: saving ? "not-allowed" : "pointer",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {saving ? "Saving…" : "Save selections"}
              </button>
              {run.status === "draft" && (
                <button
                  onClick={() => updateRun({ status: "approved", selected_hook: selectedHook, selected_title: selectedTitle })}
                  disabled={saving}
                  style={{
                    ...mono,
                    borderRadius: "3px",
                    border: "1px solid #C98A3E",
                    backgroundColor: "transparent",
                    padding: "5px 14px",
                    fontSize: "11px",
                    color: "#D9A257",
                    cursor: saving ? "not-allowed" : "pointer",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Approve
                </button>
              )}
              {run.status === "approved" && (
                <button
                  onClick={() => updateRun({ status: "published" })}
                  disabled={saving}
                  style={{
                    ...mono,
                    borderRadius: "3px",
                    border: "1px solid #4C9A6A",
                    backgroundColor: "transparent",
                    padding: "5px 14px",
                    fontSize: "11px",
                    color: "#5FA97D",
                    cursor: saving ? "not-allowed" : "pointer",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Mark published
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [inputText, setInputText] = useState("");
  const [platform, setPlatform] = useState("youtube_shorts");
  const [targetDuration, setTargetDuration] = useState("");
  const [topicId, setTopicId] = useState("");
  const [topics, setTopics] = useState([]);
  const [inputMode, setInputMode] = useState("paste"); // "paste" | "topic"
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    const { data } = await supabase
      .from("pipeline_runs")
      .select("*")
      .order("id", { ascending: false })
      .limit(50);
    setRuns(data || []);
    setLoadingRuns(false);
  }, []);

  const loadTopics = useCallback(async () => {
    const { data } = await supabase
      .from("topics")
      .select("id, title, status")
      .order("id", { ascending: false })
      .limit(100);
    setTopics(data || []);
  }, []);

  useEffect(() => {
    loadRuns();
    loadTopics();
  }, [loadRuns, loadTopics]);

  async function handleGenerate(e) {
    e.preventDefault();
    setGenError(null);

    const parsedDuration = targetDuration !== "" ? Number(targetDuration) : undefined;
    const body = {
      target_platform: platform,
      input_text:
        inputMode === "topic"
          ? topics.find((t) => String(t.id) === topicId)?.title ?? ""
          : inputText,
      topic_id: inputMode === "topic" && topicId ? Number(topicId) : undefined,
      target_duration_sec: parsedDuration && !Number.isNaN(parsedDuration) ? parsedDuration : undefined,
    };

    if (!body.input_text.trim()) {
      setGenError("Please enter text or select a topic.");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error ?? "Generation failed.");
      } else {
        setRuns((prev) => [data, ...prev]);
        setInputText("");
        setTopicId("");
      }
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handleRunUpdated(updated) {
    setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

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
        Pipeline
      </h1>
      <p style={{ marginBottom: "28px", ...mono, fontSize: "12px", color: "#7C8489" }}>
        Paste a topic or news text and generate a script, hooks, titles, and thumbnail.
      </p>

      {/* ── Generate form ── */}
      <form
        onSubmit={handleGenerate}
        style={{
          marginBottom: "36px",
          border: "1px solid #232B31",
          borderRadius: "3px",
          padding: "20px",
          backgroundColor: "#171D21",
        }}
      >
        {/* Input mode toggle */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {["paste", "topic"].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setInputMode(mode)}
              style={{
                ...mono,
                fontSize: "11px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "4px 12px",
                borderRadius: "3px",
                border: `1px solid ${inputMode === mode ? "#7C8489" : "#232B31"}`,
                backgroundColor: "transparent",
                color: inputMode === mode ? "#E8E6DE" : "#7C8489",
                cursor: "pointer",
              }}
            >
              {mode === "paste" ? "Paste text" : "Pick topic"}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "14px",
            alignItems: "start",
          }}
        >
          {/* Left: text / topic picker */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>
              {inputMode === "paste" ? "Topic / news text" : "Select topic"}
            </label>
            {inputMode === "paste" ? (
              <textarea
                rows={5}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste article text, a headline, or a brief description…"
                style={inputStyle}
              />
            ) : (
              <>

              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                style={selectStyle}
              >
                <option value="">Select a topic…</option>
                {topics.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.title} [{t.status}]
                  </option>
                ))}
              </select>
              </>
            )}
          </div>

          {/* Platform */}
          <div>
            <label style={labelStyle}>Target platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              style={selectStyle}
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div>
            <label style={labelStyle}>Target duration (seconds)</label>
            <input
              type="number"
              min={5}
              max={600}
              value={targetDuration}
              onChange={(e) => setTargetDuration(e.target.value)}
              placeholder={
                ["tiktok", "instagram_reels", "youtube_shorts"].includes(platform)
                  ? "30"
                  : "60"
              }
              style={{
                ...selectStyle,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Generate button + hint */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <button
              type="submit"
              disabled={generating}
              style={{
                ...mono,
                borderRadius: "3px",
                border: `1px solid ${generating ? "#232B31" : "#4C9A6A"}`,
                backgroundColor: "transparent",
                padding: "8px 20px",
                fontSize: "12px",
                color: generating ? "#7C8489" : "#5FA97D",
                cursor: generating ? "not-allowed" : "pointer",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                alignSelf: "flex-start",
              }}
            >
              {generating ? "Generating… (10–30s)" : "Generate"}
            </button>
            {generating && (
              <span style={{ ...mono, fontSize: "11px", color: "#7C8489" }}>
                Waiting on AI + thumbnail — this can take up to 30 seconds.
              </span>
            )}
          </div>
        </div>

        {genError && (
          <div
            style={{
              marginTop: "12px",
              ...mono,
              fontSize: "12px",
              color: "#C96158",
              border: "1px solid #B4483F",
              borderRadius: "3px",
              padding: "8px 12px",
            }}
          >
            {genError}
          </div>
        )}
      </form>

      {/* ── Past runs ── */}
      <div style={{ ...mono, fontSize: "11px", color: "#7C8489", marginBottom: "12px" }}>
        {loadingRuns ? "Loading runs…" : `${runs.length} runs`}
      </div>

      <div style={{ borderTop: "1px solid #232B31" }}>
        {!loadingRuns && runs.length === 0 && (
          <div
            style={{
              padding: "32px",
              textAlign: "center",
              ...mono,
              fontSize: "12px",
              color: "#7C8489",
            }}
          >
            No runs yet. Generate one above.
          </div>
        )}
        {runs.map((run) => (
          <RunCard key={run.id} run={run} onUpdated={handleRunUpdated} />
        ))}
      </div>
    </div>
  );
}
