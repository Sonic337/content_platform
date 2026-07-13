import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { rows } = body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
  }

  const supabase = createServerClient();

  const payload = rows
    .map((raw) => {
      if (!raw.title || !raw.title.trim()) return null;
      const row = { title: raw.title.trim(), status: raw.status ?? "new" };
      if (raw.summary) row.summary = raw.summary.trim();
      if (raw.source_name) row.source_name = raw.source_name.trim();
      if (raw.source_url) row.source_url = raw.source_url.trim();
      if (Array.isArray(raw.tags)) {
        row.tags = raw.tags;
      } else if (typeof raw.tags === "string" && raw.tags.trim()) {
        row.tags = raw.tags.split(",").map((t) => t.trim()).filter(Boolean);
      }
      return row;
    })
    .filter(Boolean);

  if (payload.length === 0) {
    return NextResponse.json({ error: "No valid rows (title is required for each row)" }, { status: 400 });
  }

  const { error } = await supabase.from("topics").insert(payload);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: payload.length });
}
