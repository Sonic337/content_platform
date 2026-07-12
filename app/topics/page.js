import DataTable from "@/components/DataTable";

export default function TopicsPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-medium text-neutral-100">Topics feed</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Placeholder data until Hermes writes here directly.
      </p>
      <DataTable
        table="topics"
        filterKey="status"
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
