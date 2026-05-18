// Standalone binary entry point. The actual server lives in the library
// (`time_tracking_api::run_server`) so the Tauri desktop shell can embed the
// same axum app in-process without forking a sidecar.

use time_tracking_api::{run_server, Config};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "time_tracking_api=info,tower_http=info".into()),
        )
        .init();

    run_server(Config::from_env()?).await
}
