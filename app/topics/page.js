"use client";

import DataTable from "@/components/DataTable";
import { topicStatusColors } from "@/lib/tierColor";

export default function TopicsPage() {
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
        Topics feed
      </h1>
      <p
        style={{
          marginBottom: "28px",
          fontFamily: "var(--font-ibm-plex-mono)",
          fontSize: "12px",
          color: "#7C8489",
        }}
      >
        Placeholder data until Hermes writes here directly.
      </p>
      <DataTable
        table="topics"
        filterKey="status"
        bodyKey="title"
        tierKey="status"
        getRowColors={(row) => topicStatusColors(row.status)}
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
