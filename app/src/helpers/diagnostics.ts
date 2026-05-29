// =====================================================================================================================
// diagnostics — explicit, previewable environment details for feedback submissions.
// =====================================================================================================================
//
// The feedback flow is user-initiated and opt-in. This helper only returns
// serializable fields that can be shown verbatim before submit. Tauri-only
// APIs are imported dynamically so browser, demo, and static builds stay safe.

declare global {
  interface Navigator {
    userAgentData?: {
      platform?: string;
      architecture?: string;
    };
  }

  interface Window {
    __ANIMO_LOG_TAIL__?: string;
    __ANIMO_VERSION__?: string;
    __TAURI_INTERNALS__?: unknown;
  }
}

export type Diagnostics = {
  app_version: string;
  platform: string;
  os_version: string;
  locale: string;
  tauri: boolean;
  recent_log_tail?: string;
  diagnostics_error?: string;
};

const MAX_LOG_TAIL_BYTES = 1024;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export async function collectDiagnostics(): Promise<Diagnostics> {
  try {
    const tauri = isTauriRuntime();
    const [appVersion, logTail] = await Promise.all([resolveAppVersion(tauri), resolveLogTail()]);

    return stripEmpty({
      app_version: appVersion,
      platform: resolvePlatform(),
      os_version: resolveOsVersion(),
      locale: resolveLocale(),
      tauri,
      recent_log_tail: logTail,
    });
  } catch (error) {
    return fallbackDiagnostics(error);
  }
}

// Synchronous twin of collectDiagnostics for the previewable, on-screen
// summary. Every field is available synchronously in both browser and Tauri;
// the only async path in collectDiagnostics is Tauri's getVersion(), whose
// build-time fallback (VITE_ANIMO_VERSION / window.__ANIMO_VERSION__) resolves
// to the same value. Keeping this sync lets XMLUI assign the result reactively
// from a method (an awaited call only updates state from an event handler).
export function collectDiagnosticsSync(): Diagnostics {
  try {
    return stripEmpty({
      app_version: resolveAppVersionSync(),
      platform: resolvePlatform(),
      os_version: resolveOsVersion(),
      locale: resolveLocale(),
      tauri: isTauriRuntime(),
      recent_log_tail: resolveLogTailSync(),
    });
  } catch (error) {
    return fallbackDiagnostics(error);
  }
}

function resolveAppVersionSync(): string {
  return normalize(
    import.meta.env.VITE_ANIMO_VERSION ||
      import.meta.env.VITE_APP_VERSION ||
      (typeof window !== "undefined" ? window.__ANIMO_VERSION__ : undefined),
  );
}

function resolveLogTailSync(): string | undefined {
  if (typeof window === "undefined" || !window.__ANIMO_LOG_TAIL__) return undefined;
  return truncateUtf8(window.__ANIMO_LOG_TAIL__, MAX_LOG_TAIL_BYTES);
}

async function resolveAppVersion(tauri: boolean): Promise<string> {
  if (tauri) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      return normalize(getVersion ? await getVersion() : undefined);
    } catch {
      // Fall through to the build-time/browser value below.
    }
  }

  return normalize(
    import.meta.env.VITE_ANIMO_VERSION ||
      import.meta.env.VITE_APP_VERSION ||
      (typeof window !== "undefined" ? window.__ANIMO_VERSION__ : undefined),
  );
}

function resolvePlatform(): string {
  if (typeof navigator === "undefined") return "unknown";

  const uaPlatform = navigator.userAgentData?.platform || navigator.platform || "unknown";
  const arch = navigator.userAgentData?.architecture;
  return arch ? `${uaPlatform}-${arch}` : uaPlatform;
}

function resolveOsVersion(): string {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.userAgent || "unknown";
}

function resolveLocale(): string {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.languages?.[0] || navigator.language || "unknown";
}

async function resolveLogTail(): Promise<string | undefined> {
  if (typeof window === "undefined" || !window.__ANIMO_LOG_TAIL__) return undefined;
  return truncateUtf8(window.__ANIMO_LOG_TAIL__, MAX_LOG_TAIL_BYTES);
}

function normalize(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}

function fallbackDiagnostics(error: unknown): Diagnostics {
  const message = error instanceof Error && error.message ? error.message : "unknown";
  return {
    app_version: normalize(
      import.meta.env.VITE_ANIMO_VERSION ||
        import.meta.env.VITE_APP_VERSION ||
        (typeof window !== "undefined" ? window.__ANIMO_VERSION__ : undefined),
    ),
    platform: resolvePlatform(),
    os_version: resolveOsVersion(),
    locale: resolveLocale(),
    tauri: isTauriRuntime(),
    diagnostics_error: message.slice(0, 240),
  };
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  return new TextDecoder().decode(bytes.slice(bytes.byteLength - maxBytes));
}

function stripEmpty(diagnostics: Diagnostics): Diagnostics {
  if (!diagnostics.recent_log_tail) {
    const { recent_log_tail: _recentLogTail, ...rest } = diagnostics;
    return rest;
  }
  return diagnostics;
}

export {};
