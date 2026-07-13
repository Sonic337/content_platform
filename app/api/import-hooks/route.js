import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// Canonical columns in the hooks table (minus id, times_used, last_used_at, embedding).
const HOOK_COLUMNS = [
  "hook_text",
  "platform",
  "category_pattern",
  "creator_archetype",
  "mechanism",
  "evidence_tier",
  "source_report",
  "notes",
];

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { rows, threshold = 0.4 } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
  }

  const supabase = createServerClient();

  const summary = {
    inserted: 0,
    contradictions: 0,
    duplicates_skipped: 0,
    errors: [],
  };

  for (const raw of rows) {
    const hook_text = (raw.hook_text || raw["Hook text"] || "").trim();
    const evidence_tier = (raw.evidence_tier || raw["Evidence tier"] || "").trim();

    if (!hook_text || !evidence_tier) {
      summary.errors.push({
        hook_text: hook_text.slice(0, 60) || "(empty)",
        reason: "hook_text and evidence_tier are required",
      });
      continue;
    }

    // Build a clean payload with only recognised hook columns.
    const payload = {};
    for (const col of HOOK_COLUMNS) {
      const val = (raw[col] || "").trim();
      if (val) payload[col] = val;
    }
    payload.hook_text = hook_text;
    payload.evidence_tier = evidence_tier;

    // Find the most similar existing hook above the threshold.
    const { data: similar, error: simErr } = await supabase.rpc("find_similar_hooks", {
      query_text: hook_text,
      threshold,
    });

    if (simErr) {
      summary.errors.push({ hook_text: hook_text.slice(0, 60), reason: simErr.message });
      continue;
    }

    if (similar && similar.length > 0) {
      const match = similar[0];
      const isContradiction = match.evidence_tier !== evidence_tier;

      // Store all fields in incoming_payload so the review UI can reconstruct the row
      // if the reviewer chooses 'resolved_added_incoming'.
      const { error: qErr } = await supabase.from("import_review_queue").insert({
        incoming_hook_text: hook_text,
        incoming_evidence_tier: evidence_tier,
        incoming_payload: payload,
        existing_hook_id: match.id,
        existing_evidence_tier: match.evidence_tier,
        similarity_score: match.similarity_score,
        status: isContradiction ? "pending" : "duplicate_skipped",
      });

      if (qErr) {
        summary.errors.push({ hook_text: hook_text.slice(0, 60), reason: qErr.message });
      } else if (isContradiction) {
        summary.contradictions++;
      } else {
        summary.duplicates_skipped++;
      }
    } else {
      const { error: insertErr } = await supabase.from("hooks").insert(payload);
      if (insertErr) {
        summary.errors.push({ hook_text: hook_text.slice(0, 60), reason: insertErr.message });
      } else {
        summary.inserted++;
      }
    }
  }

  return NextResponse.json(summary);
}
