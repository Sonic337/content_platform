"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { tierColors } from "@/lib/tierColor";

const mono = { fontFamily: "var(--font-ibm-plex-mono)" };
const sans = { fontFamily: "var(--font-ibm-plex-sans)" };
const serif = { fontFamily: "var(--font-fraunces)" };

// ── CSV parser ────────────────────────────────────────────────────────────────
// Handles quoted fields containing commas and escaped double-quotes ("").
// Does not support multi-line quoted fields (hook_text should not have literal
// newlines in a CSV export).
function parseCSVLine(line) {
  const fields = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (c === "," && !inQ) {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row;
  });
}

// ── Tier badge ────────────────────────────────────────────────────────────────
function TierBadge({ tier }) {
  const { border, text } = tierColors(tier);
  return (
    <span
      style={{
        ...mono,
        fontSize: "10px",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: "2px",
        border: `1px solid ${border}`,
        color: text,
        whiteSpace: "nowrap",
      }}
    >
      {tier}
    </span>
  );
}

// ── Small action button ───────────────────────────────────────────────────────
function ActionBtn({ label, color, border, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...mono,
        fontSize: "10px",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: "2px",
        border: `1px solid ${disabled ? "#232B31" : border}`,
        backgroundColor: "transparent",
        color: disabled ? "#3A4248" : color,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ── Review queue row ──────────────────────────────────────────────────────────
function QueueRow({ item, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function resolve(action) {
    setBusy(true);
    setErr(null);

    if (action === "add_incoming") {
      // Re-insert the full incoming payload into hooks.
      const { error: insErr } = await supabase
        .from("hooks")
        .insert(item.incoming_payload);
      if (insErr) {
        setErr(insErr.message);
        setBusy(false);
        return;
      }
    }

    const newStatus =
      action === "keep_existing"
        ? "resolved_kept_existing"
        : "resolved_added_incoming";

    const { error: upErr } = await supabase
      .from("import_review_queue")
      .update({ status: newStatus })
      .eq("id", item.id);

    if (upErr) {
      setErr(upErr.message);
      setBusy(false);
      return;
    }

    onResolved(item.id);
  }

  return (
    <div
      style={{
        borderLeft: "3px solid #C98A3E",
        backgroundColor: "#13191E",
        borderRadius: "0 3px 3px 0",
        padding: "16px 18px",
        marginBottom: "12px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "12px",
        }}
      >
        {/* Incoming */}
        <div>
          <div
            style={{
              ...mono,
              fontSize: "10px",
              color: "#7C8489",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Incoming
          </div>
          <p
            style={{
              ...serif,
              fontSize: "14px",
              color: "#E8E6DE",
              margin: "0 0 8px 0",
              lineHeight: 1.5,
            }}
          >
            {item.incoming_hook_text}
          </p>
          <TierBadge tier={item.incoming_evidence_tier} />
        </div>

        {/* Existing */}
        <div>
          <div
            style={{
              ...mono,
              fontSize: "10px",
              color: "#7C8489",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Existing in bank
          </div>
          <p
            style={{
              ...serif,
              fontSize: "14px",
              color: "#E8E6DE",
              margin: "0 0 8px 0",
              lineHeight: 1.5,
            }}
          >
            {item.hooks?.hook_text ?? "(could not load)"}
          </p>
          <TierBadge tier={item.existing_evidence_tier} />
        </div>
      </div>

      {/* Meta + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            ...mono,
            fontSize: "10px",
            color: "#7C8489",
            marginRight: "4px",
          }}
        >
          similarity {(item.similarity_score * 100).toFixed(1)}%
        </span>
        <ActionBtn
          label="Keep existing, discard incoming"
          color="#7C8489"
          border="#3A4248"
          disabled={busy}
          onClick={() => resolve("keep_existing")}
        />
        <ActionBtn
          label="Replace / add incoming anyway"
          color="#C98A3E"
          border="#C98A3E"
          disabled={busy}
          onClick={() => resolve("add_incoming")}
        />
        {err && (
          <span style={{ ...mono, fontSize: "11px", color: "#C96158" }}>
            {err}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ImportReviewPage() {
  // ── CSV import state ──
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);

  // ── Review queue state ──
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState(null);

  // Parse CSV whenever text changes
  useEffect(() => {
    setPreview(csvText.trim() ? parseCSV(csvText) : []);
  }, [csvText]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);
    const { data, error } = await supabase
      .from("import_review_queue")
      .select("*, hooks(hook_text)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setQueueLoading(false);
    if (error) { setQueueError(error.message); return; }
    setQueue(data ?? []);
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result ?? "");
    reader.readAsText(file);
  }

  async function handleImport() {
    if (preview.length === 0) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const res = await fetch("/api/import-hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setImportResult(json);
      setCsvText("");
      await loadQueue();
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImporting(false);
    }
  }

  function handleResolved(id) {
    setQueue((q) => q.filter((r) => r.id !== id));
  }

  // ── Shared input styles ──
  const inputStyle = {
    ...mono,
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    borderRadius: "3px",
    border: "1px solid #232B31",
    backgroundColor: "#10151A",
    padding: "8px 10px",
    fontSize: "13px",
    color: "#E8E6DE",
    outline: "none",
  };

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
        Hook bank — CSV import &amp; review
      </h1>
      <p
        style={{
          marginBottom: "36px",
          ...mono,
          fontSize: "12px",
          color: "#7C8489",
        }}
      >
        Upload a CSV (same columns as master_hook_bank.xlsx) to import rows into
        the hook bank. Similar hooks are flagged for review before insertion.
      </p>

      {/* ── CSV import panel ── */}
      <section
        style={{
          border: "1px solid #232B31",
          borderRadius: "3px",
          padding: "20px",
          backgroundColor: "#171D21",
          marginBottom: "40px",
        }}
      >
        <div
          style={{
            ...mono,
            fontSize: "10px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#7C8489",
            marginBottom: "14px",
          }}
        >
          Upload CSV
        </div>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileUpload}
          style={{
            ...mono,
            fontSize: "12px",
            color: "#7C8489",
            marginBottom: "14px",
            display: "block",
          }}
        />

        <div style={{ marginBottom: "10px" }}>
          <label
            style={{
              ...mono,
              fontSize: "10px",
              color: "#7C8489",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              display: "block",
              marginBottom: "5px",
            }}
          >
            Or paste CSV text
          </label>
          <textarea
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setImportResult(null); }}
            rows={8}
            placeholder={"hook_text,platform,category_pattern,creator_archetype,mechanism,evidence_tier,source_report,notes\n\"Your hook text here\",..."}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div
          style={{
            ...mono,
            fontSize: "11px",
            color: "#7C8489",
            marginBottom: "16px",
          }}
        >
          {preview.length} row{preview.length === 1 ? "" : "s"} detected
          {preview.length > 0 && (
            <span style={{ color: "#4C9A6A", marginLeft: "10px" }}>
              — headers: {Object.keys(preview[0]).join(", ")}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <button
            onClick={handleImport}
            disabled={importing || preview.length === 0}
            style={{
              ...mono,
              fontSize: "11px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "6px 16px",
              borderRadius: "3px",
              border: `1px solid ${preview.length === 0 ? "#232B31" : "#4C9A6A"}`,
              backgroundColor: "transparent",
              color: preview.length === 0 ? "#3A4248" : importing ? "#7C8489" : "#5FA97D",
              cursor: importing || preview.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {importing ? "Importing…" : `Import ${preview.length} row${preview.length === 1 ? "" : "s"}`}
          </button>

          {importResult && (
            <span style={{ ...mono, fontSize: "11px", color: "#5FA97D" }}>
              ✓ {importResult.inserted} inserted
              {importResult.contradictions > 0 && (
                <span style={{ color: "#C98A3E" }}>
                  {" "}· {importResult.contradictions} contradiction{importResult.contradictions === 1 ? "" : "s"} queued for review
                </span>
              )}
              {importResult.duplicates_skipped > 0 && (
                <span style={{ color: "#7C8489" }}>
                  {" "}· {importResult.duplicates_skipped} duplicate{importResult.duplicates_skipped === 1 ? "" : "s"} skipped
                </span>
              )}
              {importResult.errors?.length > 0 && (
                <span style={{ color: "#C96158" }}>
                  {" "}· {importResult.errors.length} error{importResult.errors.length === 1 ? "" : "s"}
                </span>
              )}
            </span>
          )}
        </div>

        {importError && (
          <div
            style={{
              marginTop: "12px",
              borderRadius: "3px",
              border: "1px solid #B4483F",
              backgroundColor: "#1a0e0d",
              padding: "8px 12px",
              ...mono,
              fontSize: "12px",
              color: "#C96158",
            }}
          >
            {importError}
          </div>
        )}

        {importResult?.errors?.length > 0 && (
          <div
            style={{
              marginTop: "12px",
              borderRadius: "3px",
              border: "1px solid #3A4248",
              padding: "8px 12px",
              ...mono,
              fontSize: "11px",
              color: "#7C8489",
            }}
          >
            {importResult.errors.map((e, i) => (
              <div key={i}>
                "{e.hook_text}" — {e.reason}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Review queue ── */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <h2
            style={{
              margin: 0,
              ...sans,
              fontSize: "14px",
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#E8E6DE",
            }}
          >
            Contradiction review queue
          </h2>
          {!queueLoading && (
            <span style={{ ...mono, fontSize: "11px", color: "#7C8489" }}>
              {queue.length} pending
            </span>
          )}
        </div>

        <p
          style={{
            ...mono,
            fontSize: "11px",
            color: "#7C8489",
            marginBottom: "20px",
            marginTop: 0,
          }}
        >
          These rows were flagged because an incoming hook had a different evidence
          tier from a similar existing hook (similarity &gt; 40%). Duplicate-skipped
          rows are not shown here — they are kept in the queue table with status
          'duplicate_skipped' for audit only.
        </p>

        {queueLoading && (
          <p style={{ ...mono, fontSize: "12px", color: "#7C8489" }}>Loading…</p>
        )}
        {queueError && (
          <p style={{ ...mono, fontSize: "12px", color: "#C96158" }}>{queueError}</p>
        )}
        {!queueLoading && !queueError && queue.length === 0 && (
          <p style={{ ...mono, fontSize: "12px", color: "#7C8489" }}>
            No pending contradictions.
          </p>
        )}

        {queue.map((item) => (
          <QueueRow key={item.id} item={item} onResolved={handleResolved} />
        ))}
      </section>
    </div>
  );
}
