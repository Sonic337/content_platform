import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-sans",
});

export const metadata = {
  title: "Content Ops Platform",
  description: "Internal content operations platform — alpha",
};

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/topics", label: "Topics feed" },
  { href: "/hooks", label: "Hook bank" },
  { href: "/corpus", label: "Writing corpus" },
  { href: "/pipeline", label: "Pipeline" },
];

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${ibmPlexMono.variable} ${ibmPlexSans.variable}`}
    >
      <head>
        <style>{`
          .nav-link {
            display: block;
            padding: 6px 10px;
            font-family: var(--font-ibm-plex-sans), 'IBM Plex Sans', system-ui, sans-serif;
            font-size: 12px;
            font-weight: 400;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #7C8489;
            text-decoration: none;
            border-radius: 3px;
            transition: color 0.15s;
          }
          .nav-link:hover { color: #E8E6DE; }
        `}</style>
      </head>
      <body style={{ minHeight: "100vh", backgroundColor: "#10151A", color: "#E8E6DE" }}>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <aside
            style={{
              width: "200px",
              flexShrink: 0,
              borderRight: "1px solid #232B31",
              padding: "28px 20px",
              backgroundColor: "#10151A",
            }}
          >
            <div
              style={{
                marginBottom: "28px",
                fontFamily: "var(--font-ibm-plex-sans), 'IBM Plex Sans', system-ui, sans-serif",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#7C8489",
              }}
            >
              Content Ops
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {NAV_ITEMS.map((item) => (
                <a key={item.href} href={item.href} className="nav-link">
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
          <main style={{ flex: 1, padding: "36px 40px" }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
