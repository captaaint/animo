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
  if (!updater) {
    return {
      available: false,
      currentVersion: currentAppVersion(),
      error: "Updater is only available in the desktop app.",
    };
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const update = await updater.check();
      if (!update) {
        return { available: false, currentVersion: currentAppVersion() };
      }
      return {
        available: true,
        currentVersion: currentAppVersion(),
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
    currentVersion: currentAppVersion(),
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
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
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
