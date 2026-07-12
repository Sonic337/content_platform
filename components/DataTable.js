"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * columns:    [{ key, label, width? }]
 * filterKey:  column name used for the quick filter dropdown (optional)
 * formFields: [{ key, label, type: "text" | "textarea" | "select", options? }]
 */
export default function DataTable({ table, columns, filterKey, formFields }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterValue, setFilterValue] = useState("");
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
    const { data, error } = await query;
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [table, filterKey, filterValue]);

  useEffect(() => {
    load();
  }, [load]);

  const filterOptions = Array.from(
    new Set(rows.map((r) => r[filterKey]).filter(Boolean))
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...formState };
    // tags fields come in as comma-separated strings in the form; convert to array
    for (const field of formFields) {
      if (field.type === "tags" && typeof payload[field.key] === "string") {
        payload[field.key] = payload[field.key]
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {filterKey && (
            <select
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200"
            >
              <option value="">All {filterKey}</option>
              {filterOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-neutral-500">{rows.length} rows</span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
        >
          {showForm ? "Cancel" : "Add row"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 p-4 sm:grid-cols-2"
        >
          {formFields.map((field) => (
            <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-xs text-neutral-400">{field.label}</label>
              {field.type === "textarea" ? (
                <textarea
                  rows={4}
                  value={formState[field.key] || ""}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, [field.key]: e.target.value }))
                  }
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
                />
              ) : field.type === "select" ? (
                <select
                  value={formState[field.key] || ""}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, [field.key]: e.target.value }))
                  }
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
                >
                  <option value="">Select…</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder={field.type === "tags" ? "comma, separated, tags" : ""}
                  value={formState[field.key] || ""}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, [field.key]: e.target.value }))
                  }
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
                />
              )}
            </div>
          ))}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 font-medium text-neutral-400">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-neutral-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-neutral-500">
                  No rows yet. Connect Supabase env vars and run the migration, or add one above.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-neutral-800/60">
                  {columns.map((col) => (
                    <td key={col.key} className="max-w-xs px-3 py-2 align-top text-neutral-300">
                      {Array.isArray(row[col.key]) ? row[col.key].join(", ") : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
