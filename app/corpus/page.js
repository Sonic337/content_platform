import DataTable from "@/components/DataTable";

export default function CorpusPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-medium text-neutral-100">Writing corpus</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Articles and posts used to train the AI on voice and style.
      </p>
      <DataTable
        table="corpus"
        filterKey="platform_published"
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
