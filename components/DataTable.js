"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * columns:              [{ key, label, format?: (rawVal) => string }]
 * filterKey:            column name used for the quick filter dropdown (optional)
 * formFields:           [{ key, label, type: "text" | "textarea" | "select" | "numeric" | "tags", options? }]
 * bodyKey:              column key whose value renders as the serif body text
 * tierKey:              column key that receives accent color treatment in meta row
 * getRowColors:         (row) => { border: string, text: string } — left stripe + tier text colors
 * tierFilterKey:        column name to use for multi-select tier toggle filter (optional)
 * allTierOptions:       array of all possible tier strings for tierFilterKey (required when tierFilterKey is set)
 * defaultExcludedTiers: tier strings excluded from view on first load (default [])
 * usageKey:             column key whose numeric value is checked for the overuse warning (optional)
 * usageWarnAt:          threshold at or above which usageKey value renders amber (default 5)
 */
export default function DataTable({
  table,
  columns,
  filterKey,
  formFields,
  bodyKey,
  tierKey,
  getRowColors,
  extraPayload = {},
  tierFilterKey,
  allTierOptions = [],
  defaultExcludedTiers = [],
  usageKey,
  usageWarnAt = 5,
  renderRowFooter = null,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterValue, setFilterValue] = useState("");
  const [excludedTiers, setExcludedTiers] = useState(() => new Set(defaultExcludedTiers));
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from(table).select("*").order("id", { ascending: false });
    if (filterKey && filterValue) {
      query = query.eq(filterKey, filterValue);
    }
    if (tierFilterKey && allTierOptions.length > 0 && excludedTiers.size > 0) {
      const included = allTierOptions.filter((t) => !excludedTiers.has(t));
      if (included.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      query = query.in(tierFilterKey, included);
    }
    const { data, error } = await query;
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [table, filterKey, filterValue, tierFilterKey, excludedTiers, allTierOptions]);

  useEffect(() => {
    load();
  }, [load]);

  const filterOptions = Array.from(
    new Set(rows.map((r) => r[filterKey]).filter(Boolean))
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...formState, ...extraPayload };
    // tags fields come in as comma-separated strings in the form; convert to array
    // numeric fields are coerced to Number() to satisfy bigint/numeric DB columns
    for (const field of formFields) {
      if (field.type === "tags" && typeof payload[field.key] === "string") {
        payload[field.key] = payload[field.key]
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      } else if (field.type === "numeric" && payload[field.key] !== "" && payload[field.key] != null) {
        payload[field.key] = Number(payload[field.key]);
      }
    }
    const { error } = await supabase.from(table).insert(payload);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setFormState({});
    setShowForm(false);
    load();
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: "3px",
    border: "1px solid #232B31",
    backgroundColor: "#171D21",
    padding: "8px 10px",
    fontSize: "13px",
    color: "#E8E6DE",
    fontFamily: "var(--font-ibm-plex-mono)",
    outline: "none",
  };

  return (
    <div>
      {/* ── Control bar ── */}
      <div
        style={{
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {filterKey && (
            <select
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              style={{
                borderRadius: "3px",
                border: "1px solid #232B31",
                backgroundColor: "#171D21",
                padding: "5px 10px",
                fontSize: "11px",
                color: "#7C8489",
                fontFamily: "var(--font-ibm-plex-mono)",
                cursor: "pointer",
              }}
            >
              <option value="">All {filterKey}</option>
              {filterOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
          {tierFilterKey && allTierOptions.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {allTierOptions.map((tier) => {
                const active = !excludedTiers.has(tier);
                const colors = getRowColors
                  ? getRowColors({ [tierKey]: tier })
                  : { border: "#7C8489", text: "#7C8489" };
                return (
                  <button
                    key={tier}
                    onClick={() =>
                      setExcludedTiers((prev) => {
                        const next = new Set(prev);
                        if (next.has(tier)) next.delete(tier);
                        else next.add(tier);
                        return next;
                      })
                    }
                    style={{
                      borderRadius: "3px",
                      border: `1px solid ${active ? colors.border : "#232B31"}`,
                      backgroundColor: "transparent",
                      padding: "3px 8px",
                      fontSize: "10px",
                      fontFamily: "var(--font-ibm-plex-mono)",
                      color: active ? colors.text : "#7C8489",
                      cursor: "pointer",
                      letterSpacing: "0.03em",
                      opacity: active ? 1 : 0.55,
                      transition: "opacity 0.1s, border-color 0.1s, color 0.1s",
                    }}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>
          )}
          <span
            style={{
              fontFamily: "var(--font-ibm-plex-mono)",
              fontSize: "11px",
              color: "#7C8489",
            }}
          >
            {rows.length} rows
          </span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            borderRadius: "3px",
            border: "1px solid #232B31",
            backgroundColor: "transparent",
            padding: "5px 12px",
            fontSize: "11px",
            fontFamily: "var(--font-ibm-plex-mono)",
            color: "#7C8489",
            cursor: "pointer",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {showForm ? "Cancel" : "Add row"}
        </button>
      </div>

      {/* ── Add-row form ── */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            marginBottom: "24px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            border: "1px solid #232B31",
            borderRadius: "3px",
            padding: "16px",
            backgroundColor: "#171D21",
          }}
        >
          {formFields.map((field) => (
            <div
              key={field.key}
              style={
                field.type === "textarea"
                  ? { gridColumn: "1 / -1" }
                  : {}
              }
            >
              <label
                style={{
                  display: "block",
                  marginBottom: "4px",
                  fontSize: "10px",
                  fontFamily: "var(--font-ibm-plex-mono)",
                  color: "#7C8489",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  rows={4}
                  value={formState[field.key] || ""}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, [field.key]: e.target.value }))
                  }
                  style={inputStyle}
                />
              ) : field.type === "select" ? (
                <select
                  value={formState[field.key] || ""}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, [field.key]: e.target.value }))
                  }
                  style={inputStyle}
                >
                  <option value="">Select…</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === "numeric" ? (
                <input
                  type="number"
                  value={formState[field.key] || ""}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, [field.key]: e.target.value }))
                  }
                  style={inputStyle}
                />
              ) : (
                <input
                  type="text"
                  placeholder={field.type === "tags" ? "comma, separated, tags" : ""}
                  value={formState[field.key] || ""}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, [field.key]: e.target.value }))
                  }
                  style={inputStyle}
                />
              )}
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                borderRadius: "3px",
                border: "1px solid #232B31",
                backgroundColor: "transparent",
                padding: "6px 16px",
                fontSize: "11px",
                fontFamily: "var(--font-ibm-plex-mono)",
                color: saving ? "#7C8489" : "#E8E6DE",
                cursor: saving ? "not-allowed" : "pointer",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div
          style={{
            marginBottom: "16px",
            borderRadius: "3px",
            border: "1px solid #B4483F",
            backgroundColor: "#1a0e0d",
            padding: "8px 12px",
            fontSize: "12px",
            fontFamily: "var(--font-ibm-plex-mono)",
            color: "#C96158",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Entry list ── */}
      <div style={{ borderTop: "1px solid #232B31" }}>
        {loading ? (
          <div
            style={{
              padding: "32px",
              textAlign: "center",
              fontFamily: "var(--font-ibm-plex-mono)",
              fontSize: "12px",
              color: "#7C8489",
            }}
          >
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              padding: "32px",
              textAlign: "center",
              fontFamily: "var(--font-ibm-plex-mono)",
              fontSize: "12px",
              color: "#7C8489",
            }}
          >
            No rows yet. Connect Supabase env vars and run the migration, or add one above.
          </div>
        ) : (
          rows.map((row) => {
            const colors = getRowColors
              ? getRowColors(row)
              : { border: "#7C8489", text: "#7C8489" };
            const metaCols = bodyKey
              ? columns.filter((c) => c.key !== bodyKey)
              : columns;
            const bodyText = bodyKey ? String(row[bodyKey] ?? "") : "";

            return (
              <div
                key={row.id}
                style={{
                  borderLeft: `3px solid ${colors.border}`,
                  borderRadius: 0,
                  borderBottom: "1px solid #232B31",
                  backgroundColor: "#171D21",
                  padding: "14px 16px",
                }}
              >
                {bodyKey && (
                  <div
                    style={{
                      fontFamily: "var(--font-fraunces)",
                      fontSize: "15px",
                      lineHeight: "1.55",
                      color: "#E8E6DE",
                      marginBottom: metaCols.length ? "8px" : 0,
                    }}
                  >
                    {bodyText || "—"}
                  </div>
                )}
                {metaCols.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "14px",
                      fontFamily: "var(--font-ibm-plex-mono)",
                      fontSize: "11px",
                      lineHeight: "1.4",
                    }}
                  >
                    {metaCols.map((col) => {
                      const rawVal = row[col.key];
                      const val = col.format
                        ? col.format(rawVal)
                        : Array.isArray(rawVal)
                          ? rawVal.join(", ")
                          : String(rawVal ?? "");
                      if (!val || val === "null") return null;
                      const isAccent = col.key === tierKey;
                      const isOverused =
                        usageKey &&
                        col.key === usageKey &&
                        typeof rawVal === "number" &&
                        rawVal >= usageWarnAt;
                      const textColor = isAccent
                        ? colors.text
                        : isOverused
                          ? "#D9A257"
                          : "#7C8489";
                      return (
                        <span key={col.key} style={{ color: textColor }}>
                          {val}
                        </span>
                      );
                    })}
                  </div>
                )}
                {renderRowFooter?.(row)}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
