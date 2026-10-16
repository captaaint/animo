import {
  AppWindow,
  ArrowLeft,
  Calendar,
  Clock,
  Cloud,
  Database,
  Download,
  ExternalLink,
  File,
  FileText,
  Filter,
  Folder,
  LayoutList,
  Link as LinkIcon,
  Settings,
  Shield,
  User,
  type LucideIcon,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import { DownloadGrid, ReleaseVersion } from "./components/DownloadGrid";
import { useTone } from "./tone";

const DEMO_URL = "https://demo.getanimo.app";

export const PAGE_TITLES: Record<string, string> = {
  "/": "Animo - Self-hosted time tracking",
  "/download": "Download Animo",
};

function Logo() {
  const tone = useTone();
  return (
    <img
      className="logo"
      src={tone === "dark" ? "/resources/dark-full-logo.svg" : "/resources/full-logo.svg"}
      alt="Animo"
    />
  );
}

function Header({ showDownload }: { showDownload: boolean }) {
  return (
    <header className="site-header">
      <div className="container row">
        <Link to="/">
          <Logo />
        </Link>
        <span className="spacer" />
        <a className="nav-link hide-mobile" href={DEMO_URL} target="_blank" rel="noreferrer">
          Demo
        </a>
        {showDownload && (
          <Link className="btn btn--primary btn--sm" to="/download">
            <Download size={16} />
            Download
          </Link>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Logo />
          <p className="muted small">
            A desktop-first, single-user time tracker for focused professionals.
          </p>
        </div>
        <span className="spacer" />
        <div className="row gap-6">
          <a className="nav-link" href={DEMO_URL} target="_blank" rel="noreferrer">
            Demo
          </a>
          <Link className="nav-link" to="/download">
            Download
          </Link>
        </div>
      </div>
    </footer>
  );
}

function Pill({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="pill">
      <Icon size={14} className="accent" />
      {children}
    </span>
  );
}

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Clock,
    title: "Flexible Time Tracking",
    text: "Start a live timer from the header or add manual start and end times. Quick, accurate, and unobtrusive.",
  },
  {
    icon: LayoutList,
    title: "Calendar and List Views",
    text: "See your week at a glance on the calendar or drill down in a clean, day-grouped list.",
  },
  {
    icon: Filter,
    title: "Powerful Filtering",
    text: "Filter by project, client, tag, or date range to focus on what matters.",
  },
  {
    icon: FileText,
    title: "Export to PDF",
    text: "Generate a clean PDF report for billing, invoicing, or your own records.",
  },
];

const STACK: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: AppWindow, title: "React", text: "Modern reactive frontend with a native feel." },
  { icon: Settings, title: "Rust + axum", text: "Fast, reliable backend built for safety." },
  { icon: Database, title: "SQLite", text: "Zero-config database. Stored locally." },
  {
    icon: LinkIcon,
    title: "Tauri",
    text: "Lightweight desktop shell today, with mobile and on-prem web app paths planned.",
  },
];

const FILES: { icon: LucideIcon; name: string; kind: string; size: string; subtle?: boolean }[] = [
  { icon: File, name: "database", kind: "SQLite Database", size: "4.2 MB" },
  { icon: Folder, name: "backups", kind: "Folder", size: "--" },
  { icon: Folder, name: "exports", kind: "Folder", size: "--" },
  { icon: FileText, name: "settings.json", kind: "JSON File", size: "2 KB", subtle: true },
];

function HomePage() {
  const tone = useTone();
  return (
    <>
      <Header showDownload />
      <main>
        <section className="container hero">
          <h1 className="hero-title">
            Everything a <span className="accent">solo operator</span> needs.
            <br />
            Nothing more.
          </h1>
          <p className="hero-lead">
            Animo is a desktop-first, single-user time tracker. No cloud account, no telemetry, and
            your work data stays on your own machine.
          </p>
          <img
            className="hero-shot"
            src={tone === "dark" ? "/resources/hero-calendar-dark.png" : "/resources/hero-calendar.png"}
            alt="Animo calendar view"
          />
          <div className="row wrap center gap-3">
            <Pill icon={Shield}>Projects &amp; clients</Pill>
            <Pill icon={Clock}>Live stopwatch</Pill>
            <Pill icon={Calendar}>Weekly calendar</Pill>
            <Pill icon={FileText}>PDF export</Pill>
            <Pill icon={AppWindow}>Mobile planned</Pill>
          </div>
          <div className="row wrap center gap-2">
            <Link className="btn btn--primary" to="/download">
              <Download size={16} />
              Download for Windows, macOS, Linux
            </Link>
            <a className="btn btn--outlined" href={DEMO_URL} target="_blank" rel="noreferrer">
              View Demo
              <ExternalLink size={16} />
            </a>
          </div>
          <div className="row wrap center gap-2 subtle tiny">
            <ReleaseVersion />
            <span>Open Source</span>
            <span>MIT License</span>
          </div>
        </section>

        <section id="features" className="band">
          <div className="container stack center gap-7">
            <h2 className="section-title">
              Everything you need. <span className="accent">Nothing</span> you don't.
            </h2>
            <div className="row wrap center gap-4 stretch">
              {FEATURES.map((f) => (
                <div key={f.title} className="feature-card">
                  <f.icon size={34} className="accent" />
                  <div className="feature-title">{f.title}</div>
                  <p className="muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container stack center gap-7 stack-section">
          <h2 className="section-title">Built with a modern, secure stack.</h2>
          <div className="row wrap center gap-4">
            {STACK.map((s) => (
              <div key={s.title} className="stack-item">
                <s.icon size={34} className="accent-soft" />
                <div>
                  <div className="strong">{s.title}</div>
                  <p className="muted small">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="privacy" className="container privacy">
          <div className="privacy-copy">
            <h2 className="section-title section-title--lg">
              100% on <span className="accent">your machine.</span>
            </h2>
            <p className="muted">
              Animo is designed for privacy and control. No hosted accounts, no cloud sync, no
              telemetry. You own your time data - always.
            </p>
            <div className="row wrap center gap-2">
              <span className="tag">
                <Cloud size={15} className="accent" />
                No Cloud
              </span>
              <span className="tag">
                <Shield size={15} className="accent" />
                No Telemetry
              </span>
              <span className="tag">
                <User size={15} className="accent" />
                No Accounts
              </span>
            </div>
          </div>
          <div className="finder">
            <div className="finder-bar">
              <ArrowLeft size={15} className="subtle" />
              <span className="finder-path">~/.config/animo/data.db</span>
            </div>
            <div className="finder-rows">
              {FILES.map((f) => (
                <div key={f.name} className="finder-row">
                  <span className="finder-name">
                    <f.icon size={17} className={f.subtle ? "subtle" : "accent"} />
                    {f.name}
                  </span>
                  <span className="muted">{f.kind}</span>
                  <span className="muted right">{f.size}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container stack center gap-4 cta">
          <h2 className="section-title section-title--lg">Ready to take control of your time?</h2>
          <p className="muted">
            Download the desktop app today; mobile and on-prem web app packaging are on the roadmap.
          </p>
          <Link className="btn btn--primary" to="/download">
            <Download size={16} />
            Download for Windows, macOS, Linux
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}

function DownloadPage() {
  return (
    <>
      <Header showDownload={false} />
      <main className="container container--narrow download-page stack center gap-8">
        <div className="stack center gap-3">
          <h1 className="download-title">Download Animo</h1>
          <p className="muted lead">
            Pick the desktop build for your operating system. Animo is local-first — your work data
            stays on your machine.
          </p>
        </div>
        <DownloadGrid />
      </main>
      <Footer />
    </>
  );
}

export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Netlify serves /download as /download/ — ignore the trailing slash.
    const route = pathname.replace(/\/+$/, "") || "/";
    document.title = PAGE_TITLES[route] ?? PAGE_TITLES["/"];
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="page">
      <Routes>
        <Route path="/download" element={<DownloadPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </div>
  );
}
