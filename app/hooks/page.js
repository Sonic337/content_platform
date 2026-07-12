"use client";

import DataTable from "@/components/DataTable";
import { tierColors } from "@/lib/tierColor";

export default function HooksPage() {
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
        Hook bank
      </h1>
      <p
        style={{
          marginBottom: "28px",
          fontFamily: "var(--font-ibm-plex-mono)",
          fontSize: "12px",
          color: "#7C8489",
        }}
      >
        Seeded from master_hook_bank.xlsx. Evidence tier tells you whether a
        hook is safe to reuse or still a hypothesis.
      </p>
      <DataTable
        table="hooks"
        filterKey="evidence_tier"
        bodyKey="hook_text"
        tierKey="evidence_tier"
        getRowColors={(row) => tierColors(row.evidence_tier)}
        columns={[
          { key: "hook_text", label: "Hook" },
          { key: "platform", label: "Platform" },
          { key: "category_pattern", label: "Category" },
          { key: "evidence_tier", label: "Evidence" },
        ]}
        formFields={[
          { key: "hook_text", label: "Hook text", type: "textarea" },
          { key: "platform", label: "Platform", type: "text" },
          { key: "category_pattern", label: "Category / pattern", type: "text" },
          { key: "creator_archetype", label: "Creator archetype", type: "text" },
          { key: "mechanism", label: "Mechanism", type: "textarea" },
          {
            key: "evidence_tier",
            label: "Evidence tier",
            type: "select",
            options: ["VERIFIED 3-0", "VERIFIED 2-1", "SOURCED, UNVERIFIED", "NOT CONFIRMED"],
          },
          { key: "source_report", label: "Source report", type: "text" },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
      />
    </div>
  );
}
