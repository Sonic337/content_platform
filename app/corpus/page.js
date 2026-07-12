"use client";

import { useState, useMemo } from "react";
import DataTable from "@/components/DataTable";
import { supabase } from "@/lib/supabaseClient";

const mono = { fontFamily: "var(--font-ibm-plex-mono)" };
const sans = { fontFamily: "var(--font-ibm-plex-sans)" };

function parsePieces(raw) {
  return raw
    .split(/\n[ \t]*---[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function deriveTitle(piece) {
  const firstLine = piece.split("\n")[0].trim();
  if (firstLine.length <= 80) return firstLine;
  return piece.slice(0, 80) + "…";
}

export default function CorpusPage() {
  const [mode, setMode] = useState("add"); // "add" | "bulk"
  const [tableKey, setTableKey] = useState(0);

  // Bulk import state
  const [bulkText, setBulkText] = useState("");
  const [batchPlatform, setBatchPlatform] = useState("");
  const [batchTags, setBatchTags] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);

  const pieces = useMemo(() => parsePieces(bulkText), [bulkText]);

  async function handleImport() {
    if (pieces.length === 0) return;
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);

    const tags = batchTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const rows = pieces.map((piece) => ({
      title: deriveTitle(piece),
      body_text: piece,
      platform_published: batchPlatform.trim() || null,
      tags: tags.length > 0 ? tags : null,
      date_published: null,
      purpose: "style_reference",
    }));

    const { error } = await supabase.from("corpus").insert(rows);
    setImporting(false);

    if (error) {
      setImportError(error.message);
      return;
    }

    setImportSuccess(`Imported ${rows.length} piece${rows.length === 1 ? "" : "s"}`);
    setBulkText("");
    setTableKey((k) => k + 1);
  }

  const toggleBtn = (value, label) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      style={{
        ...mono,
        fontSize: "11px",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "4px 12px",
        borderRadius: "3px",
        border: `1px solid ${mode === value ? "#7C8489" : "#232B31"}`,
        backgroundColor: "transparent",
        color: mode === value ? "#E8E6DE" : "#7C8489",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

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
        Writing corpus
      </h1>
      <p
        style={{
          marginBottom: "20px",
          ...mono,
          fontSize: "12px",
          color: "#7C8489",
        }}
      >
        Articles and posts used to train the AI on voice and style.
      </p>

      {/* ── Mode toggle ── */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {toggleBtn("add", "Add row")}
        {toggleBtn("bulk", "Bulk import")}
      </div>

      {/* ── Bulk import panel ── */}
      {mode === "bulk" && (
        <div
          style={{
            marginBottom: "28px",
            border: "1px solid #232B31",
            borderRadius: "3px",
            padding: "20px",
            backgroundColor: "#171D21",
          }}
        >
          <textarea
            value={bulkText}
            onChange={(e) => {
              setBulkText(e.target.value);
              setImportSuccess(null);
            }}
            rows={12}
            placeholder={"Paste multiple pieces, separated by a line with just --- between each one."}
            style={{
              ...mono,
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              borderRadius: "3px",
              border: "1px solid #232B31",
              backgroundColor: "#10151A",
              padding: "10px 12px",
              fontSize: "13px",
              color: "#E8E6DE",
              outline: "none",
              resize: "vertical",
              marginBottom: "12px",
            }}
          />

          {/* Live piece count */}
          <div
            style={{
              ...mono,
              fontSize: "11px",
              color: "#7C8489",
              marginBottom: "16px",
            }}
          >
            {pieces.length} piece{pieces.length === 1 ? "" : "s"} detected
          </div>

          {/* Shared batch fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div>
              <label
                style={{
                  ...mono,
                  display: "block",
                  marginBottom: "5px",
                  fontSize: "10px",
                  color: "#7C8489",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Platform (whole batch)
              </label>
              <input
                type="text"
                value={batchPlatform}
                onChange={(e) => setBatchPlatform(e.target.value)}
                placeholder="e.g. Instagram Reels"
                style={{
                  ...mono,
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: "3px",
                  border: "1px solid #232B31",
                  backgroundColor: "#10151A",
                  padding: "7px 10px",
                  fontSize: "13px",
                  color: "#E8E6DE",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  ...mono,
                  display: "block",
                  marginBottom: "5px",
                  fontSize: "10px",
                  color: "#7C8489",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Tags (whole batch, comma-separated)
              </label>
              <input
                type="text"
                value={batchTags}
                onChange={(e) => setBatchTags(e.target.value)}
                placeholder="e.g. ai, tools, short-form"
                style={{
                  ...mono,
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: "3px",
                  border: "1px solid #232B31",
                  backgroundColor: "#10151A",
                  padding: "7px 10px",
                  fontSize: "13px",
                  color: "#E8E6DE",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Import button + feedback */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <button
              onClick={handleImport}
              disabled={importing || pieces.length === 0}
              style={{
                ...mono,
                borderRadius: "3px",
                border: `1px solid ${pieces.length === 0 ? "#232B31" : "#4C9A6A"}`,
                backgroundColor: "transparent",
                padding: "6px 16px",
                fontSize: "11px",
                color: pieces.length === 0 ? "#7C8489" : importing ? "#7C8489" : "#5FA97D",
                cursor: importing || pieces.length === 0 ? "not-allowed" : "pointer",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {importing ? "Importing…" : "Import all"}
            </button>
            {importSuccess && (
              <span style={{ ...mono, fontSize: "11px", color: "#5FA97D" }}>
                {importSuccess}
              </span>
            )}
          </div>

          {/* Error box — same style as DataTable */}
          {importError && (
            <div
              style={{
                marginTop: "12px",
                borderRadius: "3px",
                border: "1px solid #B4483F",
                backgroundColor: "#1a0e0d",
                padding: "8px 12px",
                fontSize: "12px",
                ...mono,
                color: "#C96158",
              }}
            >
              {importError}
            </div>
          )}
        </div>
      )}

      {/* ── DataTable — key prop bumped after bulk import to force re-fetch ── */}
      <DataTable
        key={tableKey}
        table="corpus"
        filterKey="platform_published"
        bodyKey="title"
        getRowColors={() => ({ border: "#7C8489", text: "#7C8489" })}
        columns={[
          { key: "title", label: "Title" },
          { key: "platform_published", label: "Platform" },
          { key: "tags", label: "Tags" },
          { key: "date_published", label: "Published" },
        ]}
        formFields={[
          { key: "title", label: "Title", type: "text" },
          { key: "body_text", label: "Body text", type: "textarea" },
          { key: "platform_published", label: "Platform published", type: "text" },
          { key: "date_published", label: "Date published (YYYY-MM-DD)", type: "text" },
          { key: "tags", label: "Tags", type: "tags" },
        ]}
      />
    </div>
  );
}
