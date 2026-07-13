const MODULES = [
  {
    href: "/topics",
    title: "Topics feed",
    desc: "20 seeded topics. Hermes integration deferred — Supabase REST ready for direct writes.",
  },
  {
    href: "/hooks",
    title: "Hook bank",
    desc: "117 hooks seeded from master_hook_bank.xlsx, tagged by evidence tier.",
  },
  {
    href: "/corpus",
    title: "Writing corpus",
    desc: "Voice & style reference for the AI. Bulk import UI built; content is 0 rows — paste past writing here.",
  },
  {
    href: "/pipeline",
    title: "Pipeline",
    desc: "Generate scripts, hook options, titles, and a thumbnail from a topic or news brief.",
  },
  {
    href: "/analytics",
    title: "Analytics",
    desc: "Manual post-performance tracking — views, likes, watch time — linked to pipeline runs.",
  },
  {
    href: "/import-review",
    title: "Import review",
    desc: "Deduplicate incoming hooks against the bank before importing.",
  },
  {
    href: "/hook-performance",
    title: "Hook performance",
    desc: "Audit which evidence tiers produce the best engagement across approved runs.",
  },
];

export default function HomePage() {
  return (
    <div>
      <h1 className="text-xl font-medium text-neutral-100">Overview</h1>
      <p className="mt-2 max-w-lg text-sm text-neutral-400">
        Seven modules, all wired to Supabase. Pipeline, analytics, import
        review, and hook performance are built and functional.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {MODULES.map((m) => (
          <a
            key={m.href}
            href={m.href}
            className="rounded-lg border border-neutral-800 p-5 hover:border-neutral-600"
          >
            <div className="text-sm font-medium text-neutral-100">{m.title}</div>
            <div className="mt-2 text-xs text-neutral-400">{m.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
