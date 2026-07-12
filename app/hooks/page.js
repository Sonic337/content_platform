import DataTable from "@/components/DataTable";

export default function HooksPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-medium text-neutral-100">Hook bank</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Seeded from master_hook_bank.xlsx. Evidence tier tells you whether a
        hook is safe to reuse or still a hypothesis.
      </p>
      <DataTable
        table="hooks"
        filterKey="evidence_tier"
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
