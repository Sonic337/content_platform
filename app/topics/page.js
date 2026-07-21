"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import DataTable from "@/components/DataTable";
import { topicStatusColors } from "@/lib/tierColor";

const mono = { fontFamily: "var(--font-ibm-plex-mono)" };

// Keep in sync with FETCH_WINDOW_HOURS in app/api/fetch-group-news/route.js
const FETCH_WINDOW_HOURS = 48;

const TOPIC_STATUSES = ["approved", "pending_review", "rejected"];

function btnStyle(color, disabled) {
  return {
    ...mono,
    borderRadius: "3px",
    border: `1px solid ${disabled ? "#232B31" : color === "green" ? "#4C9A6A" : color === "amber" ? "#C98A3E" : "#B4483F"}`,
    backgroundColor: "transparent",
    padding: "5px 14px",
    fontSize: "11px",
    color: disabled
      ? "#7C8489"
      : color === "green"
        ? "#5FA97D"
        : color === "amber"
          ? "#D9A257"
          : "#C96158",
    cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

export default function TopicsPage() {
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState(null);

  const [rawItems, setRawItems] = useState([]);
  const [loadingRaw, setLoadingRaw] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [processingAll, setProcessingAll] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);

  const [tableKey, setTableKey] = useState(0);

  const loadRawItems = useCallback(async () => {
    setLoadingRaw(true);
    const { data } = await supabase
      .from("raw_news_items")
      .select("id, message_text, posted_at")
      .eq("status", "unprocessed")
      .order("posted_at", { ascending: false });
    setRawItems(data || []);
    setLoadingRaw(false);
  }, []);

  useEffect(() => {
    loadRawItems();
  }, [loadRawItems]);

  async function handleFetchGroupNews() {
    setFetching(true);
    setFetchResult(null);
    try {
      const res = await fetch("/api/fetch-group-news", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFetchResult({ error: data.error ?? "Fetch failed." });
      } else {
        setFetchResult(data);
        await loadRawItems();
      }
    } catch (err) {
      setFetchResult({ error: err.message });
    } finally {
      setFetching(false);
    }
  }

  async function callAnalyze(ids) {
    const res = await fetch("/api/analyze-news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawNewsItemIds: ids }),
    });
    return res.json();
  }

  async function handleProcessAll() {
    if (rawItems.length === 0 || processingAll) return;
    setProcessingAll(true);
    setAnalyzeResult(null);
    try {
      const ids = rawItems.map((r) => r.id);
      const result = await callAnalyze(ids);
      setAnalyzeResult(result);
      await loadRawItems();
      setTableKey((k) => k + 1);
    } catch (err) {
      setAnalyzeResult({ error: err.message });
    } finally {
      setProcessingAll(false);
    }
  }

  async function handleProcessOne(id) {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const result = await callAnalyze([id]);
      setAnalyzeResult(result);
      await loadRawItems();
      setTableKey((k) => k + 1);
    } catch (err) {
      setAnalyzeResult({ error: err.message });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleApprove(id) {
    await supabase.from("topics").update({ status: "approved" }).eq("id", id);
    setTableKey((k) => k + 1);
  }

  async function handleReject(id) {
    await supabase.from("topics").update({ status: "rejected" }).eq("id", id);
    setTableKey((k) => k + 1);
  }

  async function handleRevert(id) {
    await supabase
      .from("topics")
      .update({ status: "pending_review" })
      .eq("id", id);
    setTableKey((k) => k + 1);
  }

  return (
    <div>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "4px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-ibm-plex-sans)",
            fontSize: "18px",
            fontWeight: 500,
            letterSpacing: "0.02em",
            color: "#E8E6DE",
          }}
        >
          Topics feed
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Analyze result / fetch result inline labels */}
          {analyzeResult && !analyzeResult.error && (
            <span style={{ ...mono, fontSize: "11px", color: analyzeResult.stoppedEarly ? "#D9A257" : "#7C8489" }}>
              {analyzeResult.stoppedEarly
                ? `Processed ${analyzeResult.processed ?? 0} — time limit reached, ${analyzeResult.remainingUnprocessedCount ?? 0} remaining. Click Run news to continue.`
                : `${analyzeResult.processed ?? 0} processed — ${analyzeResult.createdTopics ?? 0} created, ${analyzeResult.ignoredNotRelevant ?? 0} not relevant, ${analyzeResult.ignoredDuplicate ?? 0} duplicate`}
              {analyzeResult.errors?.length > 0 && (
                <span style={{ color: "#C96158" }}>, {analyzeResult.errors.length} error{analyzeResult.errors.length !== 1 ? "s" : ""}</span>
              )}
            </span>
          )}
          {analyzeResult?.error && (
            <span style={{ ...mono, fontSize: "11px", color: "#C96158" }}>
              {analyzeResult.error}
            </span>
          )}
          {fetchResult && !fetchResult.error && !analyzeResult && (
            <span style={{ ...mono, fontSize: "11px", color: "#7C8489" }}>
              scanned {fetchResult.scanned ?? 0},{" "}
              {fetchResult.withinWindow ?? 0} within {FETCH_WINDOW_HOURS}h —{" "}
              {fetchResult.inserted ?? 0} new, {fetchResult.skipped ?? 0}{" "}
              duplicate{(fetchResult.skipped ?? 0) !== 1 ? "s" : ""}
            </span>
          )}
          {fetchResult?.error && !analyzeResult && (
            <span style={{ ...mono, fontSize: "11px", color: "#C96158" }}>
              {fetchResult.error}
            </span>
          )}
          <button
            onClick={handleProcessAll}
            disabled={processingAll || rawItems.length === 0}
            style={btnStyle("amber", processingAll || rawItems.length === 0)}
          >
            {processingAll
              ? "Running…"
              : `Run news${rawItems.length > 0 ? ` (${rawItems.length})` : ""}`}
          </button>
          <button
            onClick={handleFetchGroupNews}
            disabled={fetching}
            style={btnStyle("green", fetching)}
          >
            {fetching ? "Fetching…" : "Fetch group news"}
          </button>
        </div>
      </div>
      <p style={{ marginBottom: "20px", ...mono, fontSize: "12px", color: "#7C8489" }}>
        Placeholder data until Hermes writes here directly.
      </p>

      {/* ── Raw messages collapsible section ── */}
      {!loadingRaw && rawItems.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <button
            onClick={() => setShowRaw((v) => !v)}
            style={{
              ...mono,
              fontSize: "11px",
              color: "#7C8489",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: showRaw ? "12px" : "0",
            }}
          >
            {showRaw ? "▾" : "▸"} Raw messages ({rawItems.length} unprocessed)
          </button>
          {showRaw && (
            <div
              style={{
                border: "1px solid #232B31",
                borderRadius: "3px",
                overflow: "hidden",
              }}
            >
              {rawItems.map((item) => {
                const isProcessing = processingIds.has(item.id);
                const isExpanded = expandedIds.has(item.id);
                const needsTruncation = item.message_text.length > 240;
                const displayText =
                  isExpanded || !needsTruncation
                    ? item.message_text
                    : item.message_text.slice(0, 240) + "…";
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "12px 16px",
                      borderBottom: "1px solid #232B31",
                      backgroundColor: "#171D21",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          ...mono,
                          fontSize: "12px",
                          color: "#E8E6DE",
                          lineHeight: "1.5",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {displayText}
                      </div>
                      <div
                        style={{
                          ...mono,
                          fontSize: "10px",
                          color: "#7C8489",
                          marginTop: "4px",
                        }}
                      >
                        {new Date(item.posted_at).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", flexShrink: 0 }}>
                      <button
                        onClick={() => handleProcessOne(item.id)}
                        disabled={isProcessing || processingAll}
                        style={btnStyle("amber", isProcessing || processingAll)}
                      >
                        {isProcessing ? "Running…" : "Process"}
                      </button>
                      {needsTruncation && (
                        <button
                          onClick={() =>
                            setExpandedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                          style={{
                            ...mono,
                            background: "none",
                            border: "none",
                            padding: "0",
                            fontSize: "11px",
                            color: "#7C8489",
                            cursor: "pointer",
                            letterSpacing: "0.03em",
                          }}
                        >
                          {isExpanded ? "Collapse ▲" : "Expand ▾"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Topics DataTable ── */}
      <DataTable
        key={tableKey}
        table="topics"
        bodyKey="title"
        tierKey="status"
        tierFilterKey="status"
        allTierOptions={TOPIC_STATUSES}
        getRowColors={(row) => topicStatusColors(row.status)}
        columns={[
          { key: "title", label: "Title" },
          { key: "source_name", label: "Source" },
          { key: "tags", label: "Tags" },
          { key: "status", label: "Status" },
          { key: "date_added", label: "Added" },
        ]}
        formFields={[
          { key: "title", label: "Title", type: "text" },
          { key: "summary", label: "Summary", type: "textarea" },
          { key: "source_name", label: "Source name", type: "text" },
          { key: "source_url", label: "Source URL", type: "text" },
          { key: "tags", label: "Tags", type: "tags" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["approved", "pending_review", "rejected"],
          },
        ]}
        sortRows={(rows) =>
          [...rows].sort((a, b) => {
            const aPriority = a.status === "pending_review" ? 0 : 1;
            const bPriority = b.status === "pending_review" ? 0 : 1;
            if (aPriority !== bPriority) return aPriority - bPriority;
            return new Date(b.date_added) - new Date(a.date_added);
          })
        }
        renderRowFooter={(row) => {
          const hasPending = row.status === "pending_review";
          const hasRevertable =
            row.status === "approved" || row.status === "rejected";
          const hasReasoning = Boolean(row.ai_reasoning);
          const isBorderline = row.ai_reasoning?.includes("[BORDERLINE]");
          if (!hasPending && !hasRevertable && !hasReasoning) return null;

          return (
            <div style={{ marginTop: "12px" }}>
              {hasReasoning && (
                <div
                  style={{
                    ...mono,
                    fontSize: "11px",
                    color: "#7C8489",
                    lineHeight: "1.6",
                    whiteSpace: "pre-wrap",
                    borderLeft: "2px solid #232B31",
                    paddingLeft: "10px",
                    marginBottom: hasPending || hasRevertable ? "10px" : "0",
                  }}
                >
                  {row.ai_reasoning}
                </div>
              )}
              {hasPending && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={() => handleApprove(row.id)}
                    style={btnStyle("green", false)}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(row.id)}
                    style={btnStyle("red", false)}
                  >
                    Reject
                  </button>
                  {isBorderline && (
                    <span
                      style={{
                        ...mono,
                        fontSize: "10px",
                        color: "#C98A3E",
                        border: "1px solid #C98A3E",
                        borderRadius: "3px",
                        padding: "2px 6px",
                        letterSpacing: "0.05em",
                        opacity: 0.8,
                      }}
                    >
                      borderline
                    </span>
                  )}
                </div>
              )}
              {hasRevertable && (
                <button
                  onClick={() => handleRevert(row.id)}
                  style={{
                    ...mono,
                    background: "none",
                    border: "none",
                    padding: "0",
                    fontSize: "11px",
                    color: "#7C8489",
                    cursor: "pointer",
                    letterSpacing: "0.03em",
                  }}
                >
                  revert to pending review
                </button>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
