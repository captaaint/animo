import { useEffect, useMemo, useState } from "react";
import { useThemes } from "xmlui";
import "./DownloadGrid.css";

type PlatformKey =
  | "macos-arm64"
  | "macos-intel"
  | "windows-amd64"
  | "linux-deb"
  | "linux-appimage";

type PlatformGroup = "macos" | "windows" | "linux";

type Manifest = {
  version: string;
  artifacts: Partial<Record<PlatformKey, string>>;
};

type Props = {
  manifestUrl?: string;
  className?: string;
};

type PlatformMeta = {
  key: PlatformKey;
  group: PlatformGroup;
  title: string;
  subtitle: string;
  fileLabel: string;
  defaultPath: (version: string) => string;
};

const PLATFORMS: PlatformMeta[] = [
  {
    key: "macos-arm64",
    group: "macos",
    title: "macOS",
    subtitle: "Apple Silicon (M1, M2, M3, M4)",
    fileLabel: "DMG",
    defaultPath: (v) => `Animo_${v}_aarch64.dmg`,
  },
  {
    key: "macos-intel",
    group: "macos",
    title: "macOS",
    subtitle: "Intel (x86_64)",
    fileLabel: "DMG",
    defaultPath: (v) => `Animo_${v}_x64.dmg`,
  },
  {
    key: "windows-amd64",
    group: "windows",
    title: "Windows",
    subtitle: "x64 installer",
    fileLabel: "MSI",
    defaultPath: (v) => `Animo_${v}_x64.msi`,
  },
  {
    key: "linux-deb",
    group: "linux",
    title: "Linux",
    subtitle: "Debian / Ubuntu (.deb)",
    fileLabel: "DEB",
    defaultPath: (v) => `Animo_${v}_amd64.deb`,
  },
  {
    key: "linux-appimage",
    group: "linux",
    title: "Linux",
    subtitle: "Portable AppImage",
    fileLabel: "AppImage",
    defaultPath: (v) => `Animo_${v}_amd64.AppImage`,
  },
];

function detectPlatform(): PlatformKey | null {
  if (typeof navigator === "undefined") return null;

  const ua = navigator.userAgent ?? "";
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  const platform = (uaData?.platform || navigator.platform || "").toString();

  if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows-amd64";

  if (/Mac/i.test(platform) || /Macintosh/i.test(ua) || /Mac OS X/i.test(ua)) {
    // Browsers don't reliably expose Apple Silicon vs Intel from JS.
    // Heuristic: UA mentions "Intel" on legacy Macs and Rosetta browsers; modern
    // Apple Silicon Safari/Chrome typically omits it. Default to ARM otherwise —
    // most Macs sold since late-2020 are Apple Silicon.
    return /Intel/i.test(ua) ? "macos-intel" : "macos-arm64";
  }

  if (/Linux/i.test(platform) || /X11/i.test(ua) || /Linux/i.test(ua)) return "linux-appimage";

  return null;
}

function joinUrl(base: string, file: string): string {
  if (/^https?:\/\//i.test(file)) return file;
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  const suffix = file.startsWith("/") ? file : `/${file}`;
  return `${trimmed}${suffix}`;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function PlatformIcon({ group }: { group: PlatformGroup }) {
  if (group === "macos") {
    // Classic Apple silhouette, single path, fills with currentColor.
    return (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M17.0 12.5c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6.0-3.2.9-4.0 2.4-1.7 3.0-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.5 1.2-.1 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3.0-2.4.9-1.4 1.3-2.7 1.4-2.8-.0-.0-2.6-1.0-2.7-3.9zM14.6 5.4c.7-.8 1.1-1.9 1.0-3.0-.9.0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1.0 2.9 1.0.1 2.0-.5 2.8-1.3z" />
      </svg>
    );
  }
  if (group === "windows") {
    // Four-pane Windows logo. currentColor fill.
    return (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M3 5.5L11 4.3v7.0H3V5.5zm0 13.0V12.7h8v7.0L3 18.5zm9-14.4L21 3.0v8.3H12V4.1zm0 8.6h9V21l-9-1.0v-7.3z" />
      </svg>
    );
  }
  // Linux — simplified tux silhouette.
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2c-2.3 0-3.6 2-3.6 4.4 0 1.0.2 1.9.6 2.6-1.0 1.5-2.6 4.1-3.4 6.4-.5 1.5-.8 2.8-.4 3.7.4.9 1.4 1.3 2.4 1.3.4.0.7-.1 1.0-.2.6.5 1.7 1.0 3.4 1.0 1.7 0 2.8-.5 3.4-1.0.3.1.6.2 1.0.2 1.0 0 2.0-.4 2.4-1.3.4-.9.1-2.2-.4-3.7-.8-2.3-2.4-4.9-3.4-6.4.4-.7.6-1.6.6-2.6C15.6 4 14.3 2 12 2zm-1.2 3.5c.4 0 .7.5.7 1.1 0 .4-.2.8-.4 1.0-.2-.0-.5-.1-.7-.1s-.5.1-.7.1c-.2-.2-.4-.6-.4-1.0 0-.6.3-1.1.7-1.1.2 0 .4.1.5.3.1-.2.3-.3.5-.3zm2.4 0c.4 0 .7.5.7 1.1 0 .4-.2.8-.4 1.0-.2-.0-.5-.1-.7-.1-.2 0-.5.1-.7.1-.2-.2-.4-.6-.4-1.0 0-.6.3-1.1.7-1.1.2 0 .4.1.5.3.1-.2.3-.3.5-.3z" />
    </svg>
  );
}

export function DownloadGrid({ manifestUrl = "/downloads/manifest.json", className }: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [detected, setDetected] = useState<PlatformKey | null>(null);
  const { activeThemeTone } = useThemes();
  const tone = activeThemeTone === "dark" ? "dark" : "light";

  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(manifestUrl, { cache: "no-cache" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Manifest;
      })
      .then((data) => {
        if (!cancelled) setManifest(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setManifestError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [manifestUrl]);

  const baseHref = useMemo(() => {
    if (!manifest) return null;
    return manifestUrl.replace(/\/manifest\.json$/i, "");
  }, [manifest, manifestUrl]);

  const version = manifest?.version ?? null;

  return (
    <div className={cx("download-grid", className)} data-tone={tone}>
      <div className="download-grid__version-row">
        {version ? (
          <span className="download-grid__version-pill">v{version}</span>
        ) : manifestError ? (
          <span className="download-grid__version-pill download-grid__version-pill--error">
            Latest version unavailable
          </span>
        ) : (
          <span className="download-grid__version-pill">Loading latest version…</span>
        )}
      </div>

      <div className="download-grid__grid">
        {PLATFORMS.map((p) => {
          const isRecommended = detected === p.key;
          const artifactPath =
            manifest?.artifacts?.[p.key] ?? (version ? p.defaultPath(version) : null);
          const href = artifactPath && baseHref ? joinUrl(baseHref, artifactPath) : null;

          return (
            <a
              key={p.key}
              href={href ?? "#"}
              onClick={(ev) => {
                if (!href) ev.preventDefault();
              }}
              className={cx(
                "download-grid__card",
                isRecommended && "download-grid__card--recommended",
                !href && "download-grid__card--disabled",
              )}
              aria-disabled={href ? undefined : "true"}
              download
            >
              {isRecommended ? <span className="download-grid__badge">Recommended</span> : null}
              <div className="download-grid__platform-icon" aria-hidden="true">
                <PlatformIcon group={p.group} />
              </div>
              <div className="download-grid__title">{p.title}</div>
              <div className="download-grid__subtitle">{p.subtitle}</div>
              <div className="download-grid__file-meta">
                {p.fileLabel}
                {artifactPath ? (
                  <>
                    <span className="download-grid__file-meta-sep">·</span>
                    <span className="download-grid__file-name">
                      {artifactPath.split("/").pop()}
                    </span>
                  </>
                ) : null}
              </div>
            </a>
          );
        })}
      </div>

      <div className="download-grid__footnote">
        Verify downloads against the <code>SHA256SUMS.txt</code> file published alongside each
        release.
      </div>
    </div>
  );
}

export default DownloadGrid;
