"use client";

import DataTable from "@/components/DataTable";

export default function CorpusPage() {
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
        Writing corpus
      </h1>
      <p
        style={{
          marginBottom: "28px",
          fontFamily: "var(--font-ibm-plex-mono)",
          fontSize: "12px",
          color: "#7C8489",
        }}
      >
        Articles and posts used to train the AI on voice and style.
      </p>
      <DataTable
        table="corpus"
        filterKey="platform_published"
        bodyKey="title"
        getRowColors={() => ({ border: "#7C8489", text: "#7C8489" })}
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
