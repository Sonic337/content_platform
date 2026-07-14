"use client";

import { useState } from "react";
import DataTable from "@/components/DataTable";
import { topicStatusColors } from "@/lib/tierColor";

const mono = { fontFamily: "var(--font-ibm-plex-mono)" };

export default function TopicsPage() {
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState(null); // { fetched, inserted, skipped } | { error }

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
      }
    } catch (err) {
      setFetchResult({ error: err.message });
    } finally {
      setFetching(false);
    }
  }

  return (
    <div>
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {fetchResult && !fetchResult.error && (
            <span style={{ ...mono, fontSize: "11px", color: "#7C8489" }}>
              fetched {fetchResult.fetched} — {fetchResult.inserted} new, {fetchResult.skipped} duplicate{fetchResult.skipped !== 1 ? "s" : ""}
            </span>
          )}
          {fetchResult?.error && (
            <span style={{ ...mono, fontSize: "11px", color: "#C96158" }}>
              {fetchResult.error}
            </span>
          )}
          <button
            onClick={handleFetchGroupNews}
            disabled={fetching}
            style={{
              ...mono,
              borderRadius: "3px",
              border: `1px solid ${fetching ? "#232B31" : "#4C9A6A"}`,
              backgroundColor: "transparent",
              padding: "5px 14px",
              fontSize: "11px",
              color: fetching ? "#7C8489" : "#5FA97D",
              cursor: fetching ? "not-allowed" : "pointer",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {fetching ? "Fetching…" : "Fetch group news"}
          </button>
        </div>
      </div>
      <p
        style={{
          marginBottom: "28px",
          ...mono,
          fontSize: "12px",
          color: "#7C8489",
        }}
      >
        Placeholder data until Hermes writes here directly.
      </p>
      <DataTable
        table="topics"
        filterKey="status"
        bodyKey="title"
        tierKey="status"
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
            options: ["new", "reviewed", "used"],
          },
        ]}
      />
    </div>
  );
}
