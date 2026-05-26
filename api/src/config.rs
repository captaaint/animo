use std::net::SocketAddr;
use std::path::Path;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub database_url: String,
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
            cors_origins: Some(cors_origins),
        })
    }

    /// Desktop / Tauri configuration: random port on loopback, SQLite under
    /// the OS-provided per-user data dir, CORS allow-listed for the Vite
    /// dev origin + Tauri's built-in webview schemes.
    pub fn for_desktop(data_dir: &Path) -> Self {
        let database_url = std::env::var("DATABASE_URL")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                let db_path = data_dir.join("data.db");
                // The path goes into a `sqlite:` URI, so URL-special characters in
                // the directory tree must be percent-encoded. macOS' default
                // "Application Support" already trips naive formatting — sqlx
                // silently falls back to a CWD-relative `data.db` when the URL fails
                // to parse, which had us writing to the wrong file entirely.
                let encoded = percent_encode_sqlite_path(&db_path.to_string_lossy());
                format!("sqlite:{}?mode=rwc", encoded)
            });
        Self {
            bind_addr: "127.0.0.1:0".parse().expect("loopback addr parses"),
            database_url,
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

    fn unique_tmp_dir() -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("animo-cfg-test-{}", nanos));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn for_desktop_uses_database_url_when_provided() {
        let dir = unique_tmp_dir();
        std::env::set_var("DATABASE_URL", "sqlite:../demo.db?mode=rwc");
        let cfg = Config::for_desktop(&dir);
        std::env::remove_var("DATABASE_URL");
        assert_eq!(cfg.database_url, "sqlite:../demo.db?mode=rwc");
        std::fs::remove_dir_all(&dir).ok();
    }
}
