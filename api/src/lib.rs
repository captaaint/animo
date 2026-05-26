pub mod clients;
pub mod config;
pub mod entries;
pub mod error;
pub mod import;
pub mod projects;
pub mod reports;
pub mod state;
pub mod tags;
pub mod users;

use axum::{
    http::{header, HeaderValue, Method},
    routing::{get, patch, post},
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

pub use crate::config::Config;
pub use crate::state::AppState;

/// Builds the SQLx pool, runs embedded migrations, and returns an [`AppState`]
/// ready to be mounted on a router. Kept separate from [`build_app`] so callers
/// (binary + Tauri desktop bootstrap) can share the same setup.
pub async fn build_state(cfg: Config) -> anyhow::Result<AppState> {
    let db = SqlitePoolOptions::new()
        .max_connections(8)
        .connect(&cfg.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    tracing::info!("migrations applied");
    Ok(AppState {
        db,
        config: Arc::new(cfg),
        import_sessions: Arc::new(Mutex::new(HashMap::new())),
    })
}

/// Constructs the full axum [`Router`] — health endpoint, nested `/api`, CORS
/// layer (when configured) and tracing middleware. Pure function: no I/O.
pub fn build_app(state: AppState) -> Router {
    let cfg = state.config.clone();
    let api = Router::new()
        .route(
            "/user/bootstrap",
            get(users::get_bootstrap_status).post(users::create_first_user),
        )
        .route(
            "/user/me",
            get(users::get_current_user).patch(users::update_current_user),
        )
        .route("/clients", get(clients::list).post(clients::create))
        .route(
            "/clients/:id",
            patch(clients::update).delete(clients::delete),
        )
        .route("/projects", get(projects::list).post(projects::create))
        .route(
            "/projects/:id",
            patch(projects::update).delete(projects::delete),
        )
        .route("/time-entries", get(entries::list).post(entries::create))
        .route(
            "/time-entries/:id",
            patch(entries::update).delete(entries::delete),
        )
        .route("/tags", get(tags::list).post(tags::create))
        .route("/tags/:id", patch(tags::update).delete(tags::delete))
        .route("/reports/summary", get(reports::summary))
        .route("/reports/export.csv", get(reports::export_csv))
        .route("/reports/export.xlsx", get(reports::export_xlsx))
        .route("/reports/export.pdf", get(reports::export_pdf))
        .route("/import/csv/preview", post(import::preview_csv))
        .route("/import/csv/commit", post(import::commit_import))
        .route("/import/xlsx/preview", post(import::preview_xlsx))
        .route("/import/xlsx/commit", post(import::commit_import));

    let mut app = Router::new()
        .route("/health", get(health))
        .nest("/api", api)
        .with_state(state);

    if let Some(cors) = build_cors(&cfg) {
        app = app.layer(cors);
    }
    app.layer(TraceLayer::new_for_http())
}

fn build_cors(cfg: &Config) -> Option<CorsLayer> {
    let origins = cfg.cors_origins.as_ref()?;
    let origins: Vec<HeaderValue> = origins
        .iter()
        .filter_map(|o| o.parse::<HeaderValue>().ok())
        .collect();
    if origins.is_empty() {
        return None;
    }
    Some(
        CorsLayer::new()
            .allow_origin(origins)
            .allow_credentials(true)
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PATCH,
                Method::DELETE,
                Method::OPTIONS,
            ])
            .allow_headers([
                header::CONTENT_TYPE,
                header::AUTHORIZATION,
                header::HeaderName::from_static("x-xsrf-token"),
                // XMLUI client adds this header to every API call for tracing.
                header::HeaderName::from_static("x-ue-client-tx-id"),
            ]),
    )
}

/// Listener + router pair returned by [`bind`]. Holds the actual bound
/// [`SocketAddr`] (relevant when `cfg.bind_addr` used port 0) and the future
/// driving the server. The Tauri bootstrap inspects `local_addr` before
/// announcing the API base to the webview, then awaits [`serve`].
pub struct BoundServer {
    pub local_addr: SocketAddr,
    listener: tokio::net::TcpListener,
    app: Router,
}

impl BoundServer {
    pub async fn serve(self) -> anyhow::Result<()> {
        axum::serve(self.listener, self.app).await?;
        Ok(())
    }
}

/// Binds the TCP listener and prepares the router. Splitting bind from serve
/// lets the Tauri shell learn the actual port (when binding to :0) before the
/// webview opens.
pub async fn bind(cfg: Config) -> anyhow::Result<BoundServer> {
    let state = build_state(cfg.clone()).await?;
    let app = build_app(state);
    let listener = tokio::net::TcpListener::bind(cfg.bind_addr).await?;
    let local_addr = listener.local_addr()?;
    Ok(BoundServer {
        local_addr,
        listener,
        app,
    })
}

/// One-shot helper for the standalone binary: bind, log, serve until shutdown.
pub async fn run_server(cfg: Config) -> anyhow::Result<()> {
    let bound = bind(cfg).await?;
    tracing::info!("listening on http://{}", bound.local_addr);
    bound.serve().await
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "animo-api" }))
}
