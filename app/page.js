const MODULES = [
  {
    href: "/topics",
    title: "Topics feed",
    desc: "Daily content topics. Placeholder data until Hermes is wired in.",
  },
  {
    href: "/hooks",
    title: "Hook bank",
    desc: "117 hooks seeded from master_hook_bank.xlsx, tagged by evidence tier.",
  },
  {
    href: "/corpus",
    title: "Writing corpus",
    desc: "Articles and posts used to train the AI on voice and style.",
  },
];

export default function HomePage() {
  return (
    <div>
      <h1 className="text-xl font-medium text-neutral-100">Overview</h1>
      <p className="mt-2 max-w-lg text-sm text-neutral-400">
        Alpha build. Three modules, wired to Supabase. Analytics and the
        automation pipeline are not in this build yet.
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
