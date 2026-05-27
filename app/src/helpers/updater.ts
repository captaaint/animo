// Updater helper — wraps the Tauri v2 updater plugin so the rest of the
// app can call it from anywhere (XMLUI templates, async callbacks) and
// the browser/SSG paths degrade to a safe no-op.
//
// The Tauri plugin modules are loaded lazily because:
//   * `@tauri-apps/plugin-updater` calls into native code at import time
//     when running outside the Tauri shell, which throws in plain
//     browsers and in the demo build.
//   * Static imports would otherwise pull the plugin's JS into the
//     non-Tauri bundles and inflate the demo download.
//
// Failure mode: `checkForUpdates` retries the manifest fetch with
// exponential backoff (1s, 2s, 4s) — enough to absorb a flaky network
// without spinning indefinitely. The UI receives an `{ available: false,
// error }` result and decides whether to surface it.

import { UPDATE_MANIFEST_URL } from "../config";

export type UpdateInfo = {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  status?: "ok" | "warning" | "error";
  error?: string;
};

export type UpdateProgress = {
  downloaded: number;
  total: number;
  percentage: number;
};

export type DownloadResult = { success: true } | { success: false; error: string };

type UpdaterModule = typeof import("@tauri-apps/plugin-updater");
type ProcessModule = typeof import("@tauri-apps/plugin-process");

type UpdateManifest = {
  version?: unknown;
  platforms?: unknown;
};

let cachedUpdater: UpdaterModule | null | undefined;
let cachedProcess: ProcessModule | null | undefined;

const MAX_RETRIES = 3;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function currentAppVersion(): string {
  if (typeof window === "undefined") return "unknown";
  return window.__ANIMO_VERSION__ || "unknown";
}

async function loadUpdaterModule(): Promise<UpdaterModule | null> {
  if (cachedUpdater !== undefined) return cachedUpdater;
  if (!isTauri()) {
    cachedUpdater = null;
    return null;
  }
  try {
    cachedUpdater = await import("@tauri-apps/plugin-updater");
    return cachedUpdater;
  } catch (error) {
    console.warn("Updater plugin failed to load:", error);
    cachedUpdater = null;
    return null;
  }
}

async function loadProcessModule(): Promise<ProcessModule | null> {
  if (cachedProcess !== undefined) return cachedProcess;
  if (!isTauri()) {
    cachedProcess = null;
    return null;
  }
  try {
    cachedProcess = await import("@tauri-apps/plugin-process");
    return cachedProcess;
  } catch (error) {
    console.warn("Process plugin failed to load:", error);
    cachedProcess = null;
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const updater = await loadUpdaterModule();
  const currentVersion = currentAppVersion();
  if (!updater) {
    return {
      available: false,
      currentVersion,
      error: "Updater is only available in the desktop app.",
    };
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const manifestRead = await readManifestStatus(currentVersion);
      if (manifestRead.kind === "up-to-date") {
        return { available: false, currentVersion };
      }
      if (manifestRead.kind === "missing-platform") {
        return {
          available: false,
          currentVersion,
          status: "warning",
          error: manifestRead.message,
        };
      }

      const update = await updater.check();
      if (!update) {
        return { available: false, currentVersion };
      }
      return {
        available: true,
        currentVersion,
        latestVersion: update.version,
        releaseNotes: update.body ?? undefined,
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(2 ** attempt * 1000);
      }
    }
  }

  return {
    available: false,
    currentVersion,
    status: errorStatus(lastError),
    error: errorMessage(lastError, "Update check failed."),
  };
}

export async function downloadAndInstall(
  onProgress?: (progress: UpdateProgress) => void,
): Promise<DownloadResult> {
  const updater = await loadUpdaterModule();
  if (!updater) {
    return { success: false, error: "Updater is only available in the desktop app." };
  }

  try {
    const update = await updater.check();
    if (!update) {
      return { success: false, error: "No update available." };
    }

    let total = 0;
    let downloaded = 0;
    await update.downloadAndInstall((event) => {
      if (!onProgress) return;
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
        downloaded = 0;
        onProgress({ downloaded, total, percentage: 0 });
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        const percentage = total > 0 ? (downloaded / total) * 100 : 0;
        onProgress({ downloaded, total, percentage });
      } else if (event.event === "Finished") {
        onProgress({ downloaded: total, total, percentage: 100 });
      }
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Update download failed.") };
  }
}

export async function restartApp(): Promise<void> {
  const proc = await loadProcessModule();
  if (!proc) return;
  await proc.relaunch();
}

export function updateManifestUrl(): string {
  return UPDATE_MANIFEST_URL;
}

function errorMessage(error: unknown, fallback: string): string {
  const message =
    error instanceof Error && error.message ? error.message : typeof error === "string" ? error : "";
  if (message.includes("None of the fallback platforms")) {
    return "No installable desktop update is published for this Mac. Animo may already be up to date.";
  }
  if (message) return message;
  return fallback;
}

function errorStatus(error: unknown): "warning" | "error" {
  const message =
    error instanceof Error && error.message ? error.message : typeof error === "string" ? error : "";
  return message.includes("None of the fallback platforms") ? "warning" : "error";
}

async function readManifestStatus(
  currentVersion: string,
): Promise<
  | { kind: "unknown" }
  | { kind: "up-to-date" }
  | { kind: "missing-platform"; message: string }
> {
  try {
    const response = await fetch(updateManifestUrl(), { cache: "no-store" });
    if (!response.ok) return { kind: "unknown" };

    const manifest = (await response.json()) as UpdateManifest;
    const latestVersion = typeof manifest.version === "string" ? manifest.version : "";
    const platforms =
      manifest.platforms && typeof manifest.platforms === "object"
        ? (manifest.platforms as Record<string, unknown>)
        : {};

    if (!isNewerVersion(latestVersion, currentVersion)) {
      return { kind: "up-to-date" };
    }

    const supportedPlatforms = platformFallbacks();
    if (
      supportedPlatforms.length > 0 &&
      !supportedPlatforms.some((platform) => platform in platforms)
    ) {
      return {
        kind: "missing-platform",
        message: `v${latestVersion} is published, but no signed update package is available for ${supportedPlatforms[0]} yet. Please download the installer from getanimo.app/download.`,
      };
    }
  } catch {
    return { kind: "unknown" };
  }

  return { kind: "unknown" };
}

function platformFallbacks(): string[] {
  if (typeof navigator === "undefined") return [];
  const platform = `${navigator.userAgentData?.platform || navigator.platform || ""}`.toLowerCase();
  const arch = `${navigator.userAgentData?.architecture || ""}`.toLowerCase();

  if (platform.includes("mac") || platform.includes("darwin")) {
    if (arch.includes("arm") || arch.includes("aarch64")) {
      return ["darwin-aarch64-app", "darwin-aarch64"];
    }
    if (arch.includes("x86") || arch.includes("x64") || arch.includes("amd64")) {
      return ["darwin-x86_64-app", "darwin-x86_64"];
    }
    return ["darwin-aarch64-app", "darwin-aarch64", "darwin-x86_64-app", "darwin-x86_64"];
  }
  if (platform.includes("win")) return ["windows-x86_64"];
  if (platform.includes("linux")) return ["linux-x86_64"];
  return [];
}

function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = parseVersion(candidate);
  const currentParts = parseVersion(current);
  if (!candidateParts || !currentParts) return true;

  for (let index = 0; index < 3; index++) {
    if (candidateParts[index] > currentParts[index]) return true;
    if (candidateParts[index] < currentParts[index]) return false;
  }
  return false;
}

function parseVersion(version: string): [number, number, number] | null {
  const match = version.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

declare global {
  interface Window {
    animoUpdateCheck?: (
      onResult: (info: UpdateInfo) => void,
      onError?: (message: string) => void,
    ) => void;
    animoUpdateDownload?: (
      onProgress: (progress: UpdateProgress) => void,
      onDone: (result: DownloadResult) => void,
    ) => void;
    animoUpdateRestart?: () => void;
    animoUpdateAutoCheckEnabled?: () => boolean;
    animoUpdateSetAutoCheck?: (enabled: boolean) => void;
    animoUpdateLastChecked?: () => string | null;
    animoUpdateStartAutoCheck?: () => void;
  }
}

const AUTO_CHECK_KEY = "animo_auto_check_updates";
const LAST_CHECKED_KEY = "animo_update_last_checked";
const INITIAL_DELAY_MS = 3_000;
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function isAutoCheckEnabled(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return true;
  try {
    return window.localStorage.getItem(AUTO_CHECK_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAutoCheckEnabled(enabled: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(AUTO_CHECK_KEY, String(enabled));
  } catch {
    // best effort — UI still reflects the user's intent in-memory.
  }
}

export function lastCheckedAt(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(LAST_CHECKED_KEY);
  } catch {
    return null;
  }
}

function recordLastChecked(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(LAST_CHECKED_KEY, new Date().toISOString());
  } catch {
    // ignore — purely diagnostic
  }
}

let autoCheckStarted = false;

function dispatchUpdateAvailable(info: UpdateInfo) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("animo:update-available", { detail: info }));
}

async function runAutoCheck() {
  if (!isAutoCheckEnabled()) return;
  const info = await checkForUpdates();
  recordLastChecked();
  if (info.available) {
    dispatchUpdateAvailable(info);
  }
}

export function startAutoCheck(): void {
  if (autoCheckStarted || !isTauri()) return;
  autoCheckStarted = true;
  setTimeout(() => {
    void runAutoCheck();
  }, INITIAL_DELAY_MS);
  setInterval(() => {
    void runAutoCheck();
  }, POLL_INTERVAL_MS);
}

if (typeof window !== "undefined") {
  window.animoUpdateCheck = (onResult, onError) => {
    checkForUpdates()
      .then((info) => {
        recordLastChecked();
        onResult(info);
      })
      .catch((error: unknown) => {
        onError?.(errorMessage(error, "Update check failed."));
      });
  };
  window.animoUpdateDownload = (onProgress, onDone) => {
    downloadAndInstall(onProgress)
      .then(onDone)
      .catch((error: unknown) => {
        onDone({ success: false, error: errorMessage(error, "Update download failed.") });
      });
  };
  window.animoUpdateRestart = () => {
    restartApp().catch((error: unknown) => {
      console.warn("restartApp failed:", error);
    });
  };
  window.animoUpdateAutoCheckEnabled = isAutoCheckEnabled;
  window.animoUpdateSetAutoCheck = setAutoCheckEnabled;
  window.animoUpdateLastChecked = lastCheckedAt;
  window.animoUpdateStartAutoCheck = startAutoCheck;
  // Kick the auto-check timer once the script loads — only runs in Tauri.
  startAutoCheck();
}
