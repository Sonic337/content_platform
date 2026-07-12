import "./globals.css";

export const metadata = {
  title: "Content Ops Platform",
  description: "Internal content operations platform — alpha",
};

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/topics", label: "Topics feed" },
  { href: "/hooks", label: "Hook bank" },
  { href: "/corpus", label: "Writing corpus" },
];

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 border-r border-neutral-800 p-6">
            <div className="mb-8 text-sm font-medium tracking-wide text-neutral-400">
              CONTENT OPS
            </div>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
