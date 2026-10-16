import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  ChartColumn,
  Check,
  Clock,
  Cloud,
  Code,
  Database,
  Download,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderKanban,
  Keyboard,
  Link as LinkIcon,
  MessageSquare,
  MoonStar,
  MousePointerClick,
  RefreshCw,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Upload,
  User,
  type LucideIcon,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import { DownloadGrid, ReleaseVersion } from "./components/DownloadGrid";
import { useTone, type Tone } from "./tone";

const DEMO_URL = "https://demo.getanimo.app";
const GITHUB_URL = "https://github.com/captaaint/animo";

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
        <nav className="row header-nav hide-mobile" aria-label="Main">
          <a className="nav-link" href="/#features">
            Features
          </a>
          <a className="nav-link" href="/#privacy">
            Privacy
          </a>
          <a className="nav-link" href={DEMO_URL} target="_blank" rel="noreferrer">
            Demo
          </a>
          <a className="nav-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <span className="spacer" />
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
        <div className="row wrap center gap-6">
          <a className="nav-link" href={DEMO_URL} target="_blank" rel="noreferrer">
            Demo
          </a>
          <a className="nav-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a className="nav-link" href={`${GITHUB_URL}/releases`} target="_blank" rel="noreferrer">
            Releases
          </a>
          <Link className="nav-link" to="/download">
            Download
          </Link>
        </div>
      </div>
    </footer>
  );
}

// Screens cropped to the top of the page (sparse layouts) are 1440×600 CSS px.
const CROPPED = new Set(["timer", "projects", "import"]);

/** A screenshot in a desktop-window frame, swapped to match the page tone. */
function Shot({ name, alt, tone, eager }: { name: string; alt: string; tone: Tone; eager?: boolean }) {
  return (
    <div className="window">
      <div className="window-bar" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <img
        src={`/resources/screens/${name}-${tone}.webp`}
        alt={alt}
        width={2880}
        height={CROPPED.has(name) ? 1200 : 1800}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </div>
  );
}

type Showcase = {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: ReactNode;
  text: string;
  points: string[];
  shot: string;
  alt: string;
};

const SHOWCASE: Showcase[] = [
  {
    id: "timer",
    icon: Clock,
    eyebrow: "Track",
    title: (
      <>
        A timer that's always <span className="accent">one keystroke</span> away.
      </>
    ),
    text: "Type what you're working on in the header, pick a project and tags, and press Alt+T. The stopwatch keeps running across screens and restarts, and the desktop app mirrors it in the system tray.",
    points: [
      "Start and stop with Alt+T, the global hotkey, or the tray menu",
      "Searchable project picker, grouped by client",
      "Tags right next to the timer, so entries are organized from the start",
      "Forgot to start it? Add entries afterwards with start and end times",
    ],
    shot: "timer",
    alt: "Animo header timer with the project picker open, listing projects grouped by client",
  },
  {
    id: "views",
    icon: Calendar,
    eyebrow: "Plan & review",
    title: (
      <>
        Your week on a calendar. <span className="accent">Every entry</span> in a list.
      </>
    ),
    text: "The calendar shows each day as colored blocks, one color per project. Drag on an empty slot to create an entry, or drag an entry to move or resize it. Switch to the list for a dense, day-grouped view with totals.",
    points: [
      "Day, 5-day and week layouts with zoom",
      "Drag to create, move and resize entries, snapped to the grid",
      "Day and week totals at a glance",
      "Instant search across descriptions, projects, clients and tags",
    ],
    shot: "list",
    alt: "Animo list view grouped by day with tags, projects and durations",
  },
  {
    id: "editor",
    icon: MousePointerClick,
    eyebrow: "Edit",
    title: (
      <>
        Fix any entry in <span className="accent">seconds.</span>
      </>
    ),
    text: "Click an entry to edit it. Change the start, end or duration and the other fields update to match. Create tags as you type, and mark work as billable or internal with one switch.",
    points: [
      "Start, end and duration stay in sync",
      "Description suggestions from everything you've tracked before",
      "Create tags inline without leaving the dialog",
      "Billable switch on every entry",
      "Resume any past entry to keep working on it",
    ],
    shot: "editor",
    alt: "Animo edit entry dialog with description, project, tags, time and billable switch",
  },
  {
    id: "reports",
    icon: ChartColumn,
    eyebrow: "Analyze",
    title: (
      <>
        See where the <span className="accent">hours and money</span> went.
      </>
    ),
    text: "Reports add up any date range: total and billable hours, earnings per currency, and your daily average. Narrow them by project, client or tag, and split the breakdown chart however you need.",
    points: [
      "Total hours, billable hours, amount and daily average",
      "Daily hours chart plus a breakdown by project, client, tag or billable",
      "Hourly rates per project, with amounts kept per currency",
      "Date-range presets such as this week, last month and last quarter",
    ],
    shot: "reports",
    alt: "Animo reports with KPI cards, daily hours bar chart and project distribution donut",
  },
  {
    id: "export",
    icon: FileText,
    eyebrow: "Export",
    title: (
      <>
        Reports ready for <span className="accent">invoicing.</span>
      </>
    ),
    text: "Export the filtered report as a styled PDF and check it in the preview before you save. Need the raw data? CSV and Excel exports include every column you'd expect, including amounts.",
    points: [
      "PDF reports grouped by project and client, with a preview",
      "CSV and XLSX exports for spreadsheets and accounting tools",
      "Exports respect your date range and filters",
    ],
    shot: "pdf",
    alt: "Animo PDF report preview with total hours and per-project breakdown",
  },
];

const ORGANIZE: { icon: LucideIcon; title: string; text: string; shot: string; alt: string }[] = [
  {
    icon: FolderKanban,
    title: "Projects, clients and rates",
    text: "Give each project a color, a client and an hourly rate in its own currency. Internal work simply has no rate.",
    shot: "projects",
    alt: "Animo projects table with colors, clients and hourly rates",
  },
  {
    icon: Upload,
    title: "Bring your history with you",
    text: "Import CSV or XLSX from Toggl, Clockify, Harvest or Animo itself. Duplicates are skipped, and missing clients, projects and tags are created for you.",
    shot: "import",
    alt: "Animo import screen with file drop zone and format selection",
  },
];

const DETAILS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Keyboard, title: "Keyboard-first", text: "Alt+T toggles the timer, and a global hotkey works even when Animo is in the background." },
  { icon: Bell, title: "System tray", text: "Start, stop and check the running timer from the menu bar or taskbar." },
  { icon: Sparkles, title: "Smart autocomplete", text: "The entry editor suggests descriptions you've used before as you type." },
  { icon: MoonStar, title: "Light and dark", text: "Follows your system theme, or pick one and stick with it." },
  { icon: RefreshCw, title: "Automatic updates", text: "Animo checks for new versions and installs them with one click." },
  { icon: FileSpreadsheet, title: "Open formats", text: "Your data is one SQLite file, and exports are plain CSV, XLSX and PDF." },
  { icon: Smartphone, title: "Responsive layout", text: "Works in narrow windows today. Native mobile apps are on the roadmap." },
  { icon: MessageSquare, title: "Feedback built in", text: "Report a bug or request a feature from Settings. Diagnostics are attached only if you opt in." },
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

const HIGHLIGHTS = ["Works offline", "One SQLite file", "Windows, macOS, Linux", "MIT licensed"];

function HomePage() {
  const tone = useTone();
  return (
    <>
      <Header showDownload />
      <main>
        <section className="hero">
          <div className="container hero-inner">
            <a className="eyebrow-badge" href={GITHUB_URL} target="_blank" rel="noreferrer">
              <Code size={14} />
              Open source · MIT
              <ArrowRight size={14} />
            </a>
            <h1 className="hero-title">
              Time tracking for <span className="accent">solo professionals.</span>
              <br />
              Private by default.
            </h1>
            <p className="hero-lead">
              Animo is a desktop time tracker for freelancers and independent consultants. Run a
              timer, review your week on a calendar, and turn hours into invoice-ready reports. It
              needs no account and no cloud, and your data stays on your machine.
            </p>
            <div className="row wrap center gap-3">
              <Link className="btn btn--primary btn--lg" to="/download">
                <Download size={18} />
                Download for free
              </Link>
              <a className="btn btn--outlined btn--lg" href={DEMO_URL} target="_blank" rel="noreferrer">
                Try the live demo
                <ExternalLink size={16} />
              </a>
            </div>
            <div className="row wrap center gap-2 subtle tiny">
              <ReleaseVersion />
              <span>·</span>
              <span>Windows, macOS, Linux</span>
            </div>
          </div>
          <div className="container hero-shot-wrap">
            <div className="hero-glow" aria-hidden />
            <Shot
              name="calendar"
              tone={tone}
              eager
              alt="Animo week calendar with color-coded time entries and a running timer"
            />
          </div>
          <div className="container">
            <ul className="highlights">
              {HIGHLIGHTS.map((h) => (
                <li key={h}>
                  <Check size={16} className="accent" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="features" className="features">
          <div className="container stack center gap-3 section-head">
            <span className="eyebrow">Features</span>
            <h2 className="section-title section-title--xl">
              Everything you need. <span className="accent">Nothing</span> you don't.
            </h2>
            <p className="muted section-lead">
              Animo covers the whole loop for one person: capture time as you work, review it, and
              bill for it. There are no team seats, approval flows or dashboards you'll never open.
            </p>
          </div>

          {SHOWCASE.map((s, i) => (
            <div key={s.id} id={s.id} className={`container showcase${i % 2 ? " showcase--flip" : ""}`}>
              <div className="showcase-copy">
                <span className="eyebrow">
                  <s.icon size={15} />
                  {s.eyebrow}
                </span>
                <h3 className="showcase-title">{s.title}</h3>
                <p className="muted">{s.text}</p>
                <ul className="checklist">
                  {s.points.map((p) => (
                    <li key={p}>
                      <Check size={16} className="accent" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="showcase-media">
                <Shot name={s.shot} tone={tone} alt={s.alt} />
              </div>
            </div>
          ))}

          <div className="container organize">
            {ORGANIZE.map((o) => (
              <div key={o.title} className="organize-card">
                <div className="stack gap-3">
                  <span className="icon-chip">
                    <o.icon size={20} />
                  </span>
                  <h3 className="card-title">{o.title}</h3>
                  <p className="muted">{o.text}</p>
                </div>
                <Shot name={o.shot} tone={tone} alt={o.alt} />
              </div>
            ))}
          </div>
        </section>

        <section className="band">
          <div className="container stack center gap-7">
            <div className="stack center gap-3">
              <span className="eyebrow">Details</span>
              <h2 className="section-title section-title--lg">The small things, done right.</h2>
            </div>
            <div className="details-grid">
              {DETAILS.map((d) => (
                <div key={d.title} className="detail">
                  <span className="icon-chip">
                    <d.icon size={18} />
                  </span>
                  <div className="feature-title">{d.title}</div>
                  <p className="muted small">{d.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="privacy" className="container privacy">
          <div className="privacy-copy">
            <span className="eyebrow">Privacy</span>
            <h2 className="section-title section-title--lg">
              100% on <span className="accent">your machine.</span>
            </h2>
            <p className="muted">
              Animo is built for privacy and control. There are no hosted accounts, no cloud sync
              and no telemetry. Everything lives in a single SQLite file you can back up, move or
              open with any SQLite tool. Your time data is always yours.
            </p>
            <div className="row wrap gap-2">
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

        <section className="container stack center gap-7 stack-section">
          <div className="stack center gap-3">
            <span className="eyebrow">Under the hood</span>
            <h2 className="section-title section-title--lg">Built with a modern, secure stack.</h2>
          </div>
          <div className="stack-grid">
            {STACK.map((s) => (
              <div key={s.title} className="stack-item">
                <s.icon size={28} className="accent-soft" />
                <div>
                  <div className="strong">{s.title}</div>
                  <p className="muted small">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="container cta-wrap">
          <div className="cta">
            <h2 className="section-title section-title--xl">Ready to take control of your time?</h2>
            <p className="muted section-lead">
              Download the desktop app for free, or explore the live demo with three months of
              sample data first. Mobile and on-prem web app packaging are on the roadmap.
            </p>
            <div className="row wrap center gap-3">
              <Link className="btn btn--primary btn--lg" to="/download">
                <Download size={18} />
                Download for Windows, macOS, Linux
              </Link>
              <a className="btn btn--outlined btn--lg" href={DEMO_URL} target="_blank" rel="noreferrer">
                Open the demo
                <ExternalLink size={16} />
              </a>
            </div>
          </div>
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
  const { pathname, hash } = useLocation();
  useEffect(() => {
    // Netlify serves /download as /download/ — ignore the trailing slash.
    const route = pathname.replace(/\/+$/, "") || "/";
    document.title = PAGE_TITLES[route] ?? PAGE_TITLES["/"];
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <div className="page">
      <Routes>
        <Route path="/download" element={<DownloadPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </div>
  );
}
