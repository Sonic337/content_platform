"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { topicStatusColors } from "@/lib/tierColor";

const mono = { fontFamily: "var(--font-ibm-plex-mono)" };

function btnStyle(disabled) {
  return {
    ...mono,
    borderRadius: "3px",
    border: `1px solid ${disabled ? "#232B31" : "#4C9A6A"}`,
    backgroundColor: "transparent",
    padding: "5px 14px",
    fontSize: "11px",
    color: disabled ? "#7C8489" : "#5FA97D",
    cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

export default function ArchivePage() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rawItemsMap, setRawItemsMap] = useState({});
  const [unarchiving, setUnarchiving] = useState(new Set());

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("topics")
      .select("*")
      .eq("status", "archived")
      .order("date_added", { ascending: false });
    setTopics(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (topics.length === 0) return;
    const ids = topics.map((t) => t.source_raw_news_item_id).filter(Boolean);
    if (ids.length === 0) return;
    supabase
      .from("raw_news_items")
      .select("id, posted_at")
      .in("id", ids)
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        for (const r of data) map[r.id] = r;
        setRawItemsMap(map);
      });
  }, [topics]);

  async function handleUnarchive(id) {
    setUnarchiving((prev) => new Set(prev).add(id));
    await supabase
      .from("topics")
      .update({ status: "pending_review" })
      .eq("id", id);
    setUnarchiving((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setTopics((prev) => prev.filter((t) => t.id !== id));
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
        Archive
      </h1>
      <p
        style={{
          marginBottom: "28px",
          ...mono,
          fontSize: "12px",
          color: "#7C8489",
        }}
      >
        Topics archived from the feed. Un-archiving sets status back to
        pending_review.
      </p>

      <div
        style={{
          ...mono,
          fontSize: "11px",
          color: "#7C8489",
          marginBottom: "16px",
        }}
      >
        {loading ? "" : `${topics.length} archived`}
      </div>

      <div style={{ borderTop: "1px solid #232B31" }}>
        {loading ? (
          <div
            style={{
              padding: "32px",
              textAlign: "center",
              ...mono,
              fontSize: "12px",
              color: "#7C8489",
            }}
          >
            Loading…
          </div>
        ) : topics.length === 0 ? (
          <div
            style={{
              padding: "32px",
              textAlign: "center",
              ...mono,
              fontSize: "12px",
              color: "#7C8489",
            }}
          >
            No archived topics.
          </div>
        ) : (
          topics.map((row) => {
            const colors = topicStatusColors(row.status);
            const rawItem = rawItemsMap[row.source_raw_news_item_id];
            const isUnarchiving = unarchiving.has(row.id);

            return (
              <div
                key={row.id}
                style={{
                  borderLeft: `3px solid ${colors.border}`,
                  borderBottom: "1px solid #232B31",
                  backgroundColor: "#171D21",
                  padding: "14px 16px",
                }}
              >
                {/* Title */}
                <div
                  style={{
                    fontFamily: "var(--font-fraunces)",
                    fontSize: "15px",
                    lineHeight: "1.55",
                    color: "#E8E6DE",
                    marginBottom: "8px",
                  }}
                >
                  {row.title || "—"}
                </div>

                {/* Meta row */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "14px",
                    ...mono,
                    fontSize: "11px",
                    color: "#7C8489",
                    lineHeight: "1.4",
                  }}
                >
                  {row.tags?.length > 0 && (
                    <span>{row.tags.join(", ")}</span>
                  )}
                  {row.original_date && (
                    <span>news: {row.original_date}</span>
                  )}
                  {rawItem?.posted_at && (
                    <span>
                      telegram:{" "}
                      {new Date(rawItem.posted_at).toLocaleDateString()}
                    </span>
                  )}
                  {row.date_added && (
                    <span>
                      added:{" "}
                      {new Date(row.date_added).toLocaleDateString()}
                    </span>
                  )}
                  {row.approved_at && (
                    <span>
                      approved:{" "}
                      {new Date(row.approved_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Un-archive */}
                <div style={{ marginTop: "12px" }}>
                  <button
                    onClick={() => handleUnarchive(row.id)}
                    disabled={isUnarchiving}
                    style={btnStyle(isUnarchiving)}
                  >
                    {isUnarchiving ? "Restoring…" : "Un-archive"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
