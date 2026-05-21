import { useEffect, useMemo, useState } from "react";
import "./DownloadGrid.css";

type PlatformKey =
  | "macos-arm64"
  | "macos-intel"
  | "windows-amd64"
  | "linux-deb"
  | "linux-appimage";

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
  group: "macos" | "windows" | "linux";
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

export function DownloadGrid({ manifestUrl = "/downloads/manifest.json", className }: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [detected, setDetected] = useState<PlatformKey | null>(null);

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
    <div className={cx("download-grid", className)}>
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
                {p.group === "macos" ? "" : p.group === "windows" ? "⊞" : "🐧"}
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
