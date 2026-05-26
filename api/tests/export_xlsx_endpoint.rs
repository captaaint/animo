// =====================================================================================================================
// End-to-end test for /api/reports/export.xlsx.
// =====================================================================================================================
//
// Seeds a few entries, hits the endpoint, then parses the returned
// bytes back with calamine to verify the workbook shape. Round-tripping
// through the XLSX reader catches both bad cell formats and the silent
// "byte-soup is valid XLSX" failure mode where the body is OK but the
// workbook is missing sheets.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use animo_api::{build_app, AppState, Config};
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use calamine::{Data, Reader, Xlsx};
use sqlx::sqlite::SqlitePoolOptions;
use std::io::Cursor;
use tower::util::ServiceExt;

const USER_ID: &str = "user-xlsx";
const PROJECT_ID: &str = "proj-1";
const CLIENT_ID: &str = "client-1";

async fn seed_state() -> AppState {
    let db = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&db).await.unwrap();

    sqlx::query("INSERT INTO users (id, name, username) VALUES (?, ?, ?)")
        .bind(USER_ID)
        .bind("Tester")
        .bind("tester")
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO clients (id, user_id, name) VALUES (?, ?, ?)")
        .bind(CLIENT_ID)
        .bind(USER_ID)
        .bind("NSoftware")
        .execute(&db)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO projects (id, user_id, client_id, name, hourly_rate, currency) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(PROJECT_ID)
    .bind(USER_ID)
    .bind(CLIENT_ID)
    .bind("Animo")
    .bind(60.0_f64)
    .bind("EUR")
    .execute(&db)
    .await
    .unwrap();

    // Two billable entries on the same day — 1h + 30m at €60/h = €90 total.
    sqlx::query(
        "INSERT INTO time_entries \
         (id, user_id, project_id, description, start_time, end_time, \
          duration_seconds, billable) \
         VALUES \
         ('e1', ?, ?, 'morning', '2026-05-25T09:00:00.000Z', '2026-05-25T10:00:00.000Z', 3600, 1), \
         ('e2', ?, ?, 'review',  '2026-05-25T10:00:00.000Z', '2026-05-25T10:30:00.000Z', 1800, 1)",
    )
    .bind(USER_ID)
    .bind(PROJECT_ID)
    .bind(USER_ID)
    .bind(PROJECT_ID)
    .execute(&db)
    .await
    .unwrap();

    AppState {
        db,
        config: Arc::new(Config {
            database_url: "sqlite::memory:".into(),
            bind_addr: "127.0.0.1:0".parse().unwrap(),
            cors_origins: None,
        }),
        import_sessions: Arc::new(Mutex::new(HashMap::new())),
    }
}

#[tokio::test]
async fn export_xlsx_returns_well_formed_workbook() {
    let state = seed_state().await;
    let req = Request::builder()
        .method("GET")
        .uri("/api/reports/export.xlsx?from=2026-05-25&to=2026-05-25")
        .body(Body::empty())
        .unwrap();
    let res = build_app(state).oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let headers = res.headers().clone();
    assert!(headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap()
        .starts_with("application/vnd.openxmlformats-officedocument"));
    assert!(headers
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .unwrap()
        .contains("animo_export_2026-05-25_2026-05-25.xlsx"));

    let bytes = to_bytes(res.into_body(), 4 * 1024 * 1024).await.unwrap();
    let mut workbook: Xlsx<_> = Xlsx::new(Cursor::new(bytes.to_vec())).unwrap();
    let names = workbook.sheet_names();
    assert_eq!(names, vec!["Entries".to_string(), "Summary".to_string()]);

    let entries = workbook.worksheet_range("Entries").unwrap();
    let rows: Vec<_> = entries.rows().collect();
    // 1 header row + 2 data rows
    assert_eq!(rows.len(), 3);
    let header: Vec<String> = rows[0]
        .iter()
        .map(|c| match c {
            Data::String(s) => s.clone(),
            other => format!("{other:?}"),
        })
        .collect();
    assert_eq!(header[0], "entry_id");
    assert_eq!(header[4], "duration_seconds");
    assert_eq!(header[13], "amount");

    // First data row: e1 description "morning"
    let desc = match &rows[1][6] {
        Data::String(s) => s.clone(),
        other => panic!("expected string, got {other:?}"),
    };
    assert_eq!(desc, "morning");
    // Duration: 3600 seconds
    let dur = match &rows[1][4] {
        Data::Float(f) => *f,
        Data::Int(n) => *n as f64,
        other => panic!("expected number, got {other:?}"),
    };
    assert_eq!(dur, 3600.0);

    // Summary sheet: at least three header rows + a project rollup.
    let summary = workbook.worksheet_range("Summary").unwrap();
    let srows: Vec<_> = summary.rows().collect();
    assert!(srows.len() >= 5, "summary too short: {}", srows.len());
    let total_label = match &srows[1][0] {
        Data::String(s) => s.clone(),
        other => format!("{other:?}"),
    };
    assert_eq!(total_label, "Total hours");
}

#[tokio::test]
async fn export_xlsx_rejects_bad_date() {
    let state = seed_state().await;
    let req = Request::builder()
        .method("GET")
        .uri("/api/reports/export.xlsx?from=garbage&to=2026-05-25")
        .body(Body::empty())
        .unwrap();
    let res = build_app(state).oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}
