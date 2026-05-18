use std::net::SocketAddr;
use std::path::Path;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CookieSameSite {
    /// Cross-origin in dev (front-end on :5173, API on :8080) needs None so
    /// the browser sends the cookie on XHR/fetch. Requires Secure.
    None,
    /// Desktop / same-origin deployments — safer and still allows top-level
    /// navigation cookies.
    Lax,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub database_url: String,
    pub jwt_secret: String,
    /// SameSite attribute used when issuing session cookies.
    pub cookie_same_site: CookieSameSite,
    /// Whether to mark session cookies as `Secure`. Browser dev mode keeps
    /// it `true` (cross-origin XHR with SameSite=None requires Secure).
    /// Desktop mode drops it: WKWebView on macOS silently refuses to store
    /// `Secure` cookies received over plain `http://localhost`, even though
    /// the spec allows the loopback exception. Without Secure the cookie
    /// gets persisted and every follow-up request carries the session.
    pub cookie_secure: bool,
    /// CORS allow-list. `None` disables the CORS layer entirely (desktop
    /// mode: API + webview share the same origin, no cross-origin needed).
    pub cors_origins: Option<Vec<String>>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let bind_addr = std::env::var("BIND_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:8080".into())
            .parse()?;
        let database_url =
            std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:data.db?mode=rwc".into());
        let jwt_secret = std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "dev-secret-change-me".into());
        let cors_origins = std::env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| {
                // Vite picks the first free port in 5173..=5176, so allow them all in dev.
                "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176"
                    .into()
            })
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();
        Ok(Self {
            bind_addr,
            database_url,
            jwt_secret,
            cookie_same_site: CookieSameSite::None,
            cookie_secure: true,
            cors_origins: Some(cors_origins),
        })
    }

    /// Desktop / Tauri configuration: random port on loopback, SQLite under
    /// the OS-provided per-user data dir, CORS allow-listed for the Vite
    /// dev origin + Tauri's built-in webview schemes, SameSite=Lax cookies.
    ///
    /// Origin/cookie story: the webview lives at `http://localhost:5173`
    /// (dev) or `tauri://localhost` / `http://tauri.localhost` (release).
    /// The API is exposed to the webview as `http://localhost:<port>` (see
    /// the `api_base` Tauri command — we intentionally use `localhost`
    /// instead of `127.0.0.1` so the page and API share the same site).
    /// Different ports on the same host count as same-site, so `Lax` is
    /// enough to keep the session cookie attached to every XHR. Going
    /// through `127.0.0.1` had the page and API on different sites; Safari's
    /// ITP silently dropped the Set-Cookie and every DataSource came back
    /// 401 immediately after login.
    pub fn for_desktop(data_dir: &Path) -> Self {
        let db_path = data_dir.join("data.db");
        // The path goes into a `sqlite:` URI, so URL-special characters in
        // the directory tree must be percent-encoded. macOS' default
        // "Application Support" already trips naive formatting — sqlx
        // silently falls back to a CWD-relative `data.db` when the URL fails
        // to parse, which had us writing to the wrong file entirely.
        let encoded = percent_encode_sqlite_path(&db_path.to_string_lossy());
        let database_url = format!("sqlite:{}?mode=rwc", encoded);
        Self {
            bind_addr: "127.0.0.1:0".parse().expect("loopback addr parses"),
            database_url,
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "desktop-dev-secret-change-me".into()),
            cookie_same_site: CookieSameSite::Lax,
            cookie_secure: false,
            cors_origins: Some(desktop_cors_origins()),
        }
    }
}

/// Origins the desktop shell needs to accept on cross-origin XHR. Covers:
///   - `http://localhost:5173..5176` — Vite dev server during `tauri dev`.
///   - `tauri://localhost` — macOS / iOS release scheme.
///   - `http://tauri.localhost` — Windows / Linux release scheme (Tauri 2
///     serves the bundled assets there via the asset protocol).
fn desktop_cors_origins() -> Vec<String> {
    vec![
        "http://localhost:5173".into(),
        "http://localhost:5174".into(),
        "http://localhost:5175".into(),
        "http://localhost:5176".into(),
        "tauri://localhost".into(),
        "http://tauri.localhost".into(),
    ]
}

fn percent_encode_sqlite_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        match ch {
            // `%` must come first if iterated, but we match per-char so order
            // here is irrelevant — listing the chars that would otherwise
            // confuse the URI parser (RFC 3986 reserved + space).
            '%' => out.push_str("%25"),
            ' ' => out.push_str("%20"),
            '?' => out.push_str("%3F"),
            '#' => out.push_str("%23"),
            _ => out.push(ch),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_encodes_macos_application_support_path() {
        // Regression: an unencoded space in "Application Support" made sqlx
        // fall through to a CWD-relative DB and silently lose user data.
        let url = format!(
            "sqlite:{}?mode=rwc",
            percent_encode_sqlite_path("/Users/me/Library/Application Support/app/data.db")
        );
        assert_eq!(
            url,
            "sqlite:/Users/me/Library/Application%20Support/app/data.db?mode=rwc"
        );
    }

    #[test]
    fn percent_encodes_other_uri_reserved_chars() {
        assert_eq!(
            percent_encode_sqlite_path("/tmp/x?y#z 50%"),
            "/tmp/x%3Fy%23z%2050%25"
        );
    }
}
