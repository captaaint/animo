// =====================================================================================================================
// End-to-end tests for /api/import/csv/preview and /api/import/csv/commit.
// =====================================================================================================================
//
// Strategy:
//   - Spin up the real router with an in-memory SQLite database so the
//     preview + commit flow exercises every layer (multipart parsing,
//     CSV parsing, duplicate detection, transactional inserts).
//   - Seed a single user via `users` insert — the LocalUser extractor
//     uses ORDER BY created_at LIMIT 1, so we don't need to log in.
//   - Issue requests with `tower::ServiceExt::oneshot` to avoid binding
//     a TCP listener.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use animo_api::{build_app, AppState, Config};
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::Value;
use sqlx::sqlite::SqlitePoolOptions;
use tower::util::ServiceExt;

const TEST_USER_ID: &str = "test-user-1";
const TEST_USERNAME: &str = "tester";

async fn build_test_state() -> AppState {
    let db = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect in-memory sqlite");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("run migrations");

    sqlx::query("INSERT INTO users (id, name, username) VALUES (?, ?, ?)")
        .bind(TEST_USER_ID)
        .bind("Test User")
        .bind(TEST_USERNAME)
        .execute(&db)
        .await
        .expect("seed test user");

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

/// Build a `multipart/form-data` body that mimics what axum-extra's
/// `Multipart` will produce on the wire. Hand-rolled rather than pulling
/// in `reqwest` just to construct a body in tests.
fn multipart_body(boundary: &str, file_contents: &[u8], format: Option<&str>) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        b"Content-Disposition: form-data; name=\"file\"; filename=\"upload.csv\"\r\n\
          Content-Type: text/csv\r\n\r\n",
    );
    body.extend_from_slice(file_contents);
    body.extend_from_slice(b"\r\n");
    if let Some(fmt) = format {
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"source_format\"\r\n\r\n");
        body.extend_from_slice(fmt.as_bytes());
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    body
}

async fn post_preview(state: &AppState, csv: &str, format: Option<&str>) -> (StatusCode, Value) {
    let boundary = "ANIMOTESTBOUNDARY";
    let body = multipart_body(boundary, csv.as_bytes(), format);
    let req = Request::builder()
        .method("POST")
        .uri("/api/import/csv/preview")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))
        .unwrap();
    let app = build_app(state.clone());
    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), 1024 * 1024).await.unwrap();
    let json: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, json)
}

async fn post_commit(state: &AppState, session_id: &str) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("POST")
        .uri("/api/import/csv/commit")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "sessionId": session_id }).to_string(),
        ))
        .unwrap();
    let app = build_app(state.clone());
    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), 1024 * 1024).await.unwrap();
    let json: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, json)
}

const SAMPLE_ANIMO_CSV: &str = "\
entry_id,date,start_time,end_time,duration_seconds,duration_formatted,description,project_name,client_name,tags,billable,hourly_rate,currency,amount
e-1,2026-05-25,09:00:00,10:30:00,5400,1h 30m,Worked on tray,Animo,NSoftware,deep work,true,60.00,EUR,90.00
e-2,2026-05-25,11:00:00,12:00:00,3600,1h 00m,Sync,Animo,NSoftware,planning,false,0.00,EUR,0.00
";

#[tokio::test]
async fn preview_returns_summary_for_clean_file() {
    let state = build_test_state().await;
    let (status, body) = post_preview(&state, SAMPLE_ANIMO_CSV, None).await;
    assert_eq!(status, StatusCode::OK, "body={body}");
    assert_eq!(body["format"], "animo");
    assert_eq!(body["totalRows"], 2);
    assert_eq!(body["validRows"], 2);
    assert_eq!(body["duplicateWarnings"], 0);
    assert_eq!(body["errorRows"].as_array().unwrap().len(), 0);
    assert_eq!(
        body["entitiesToCreate"]["clients"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        body["entitiesToCreate"]["projects"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        body["entitiesToCreate"]["tags"].as_array().unwrap().len(),
        2
    );
    assert!(body["sessionId"].as_str().is_some_and(|s| !s.is_empty()));
}

#[tokio::test]
async fn commit_creates_entities_and_entries() {
    let state = build_test_state().await;

    let (_, preview) = post_preview(&state, SAMPLE_ANIMO_CSV, None).await;
    let session_id = preview["sessionId"].as_str().unwrap().to_string();

    let (status, commit) = post_commit(&state, &session_id).await;
    assert_eq!(status, StatusCode::OK, "commit body={commit}");
    assert_eq!(commit["entriesCreated"], 2);
    assert_eq!(commit["clientsCreated"], 1);
    assert_eq!(commit["projectsCreated"], 1);
    assert_eq!(commit["tagsCreated"], 2);
    assert_eq!(commit["duplicatesSkipped"], 0);

    // Verify DB state directly — the response counts could lie about
    // what actually landed in the tables.
    let (clients,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clients")
        .fetch_one(&state.db)
        .await
        .unwrap();
    let (projects,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM projects")
        .fetch_one(&state.db)
        .await
        .unwrap();
    let (tags,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM tags")
        .fetch_one(&state.db)
        .await
        .unwrap();
    let (entries,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM time_entries")
        .fetch_one(&state.db)
        .await
        .unwrap();
    let (links,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM entry_tags")
        .fetch_one(&state.db)
        .await
        .unwrap();
    assert_eq!(clients, 1);
    assert_eq!(projects, 1);
    assert_eq!(tags, 2);
    assert_eq!(entries, 2);
    // Each row has exactly one tag, so two link rows.
    assert_eq!(links, 2);
}

#[tokio::test]
async fn second_preview_flags_duplicates() {
    let state = build_test_state().await;

    // First import: full commit, lands two entries.
    let (_, preview) = post_preview(&state, SAMPLE_ANIMO_CSV, None).await;
    let session_id = preview["sessionId"].as_str().unwrap().to_string();
    let _ = post_commit(&state, &session_id).await;

    // Re-uploading the same file should classify both rows as duplicates.
    let (_, preview2) = post_preview(&state, SAMPLE_ANIMO_CSV, None).await;
    assert_eq!(preview2["totalRows"], 2);
    assert_eq!(preview2["validRows"], 0);
    assert_eq!(preview2["duplicateWarnings"], 2);

    // Committing should create no new entries but report the skipped count.
    let session_id2 = preview2["sessionId"].as_str().unwrap().to_string();
    let (status, commit) = post_commit(&state, &session_id2).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(commit["entriesCreated"], 0);
    assert_eq!(commit["duplicatesSkipped"], 2);

    let (entries,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM time_entries")
        .fetch_one(&state.db)
        .await
        .unwrap();
    assert_eq!(entries, 2);
}

#[tokio::test]
async fn preview_reports_per_row_errors() {
    let state = build_test_state().await;
    let bad_csv = "\
entry_id,date,start_time,end_time,duration_seconds,description,project_name,client_name
e-1,not-a-date,09:00:00,10:30:00,5400,bad row,Animo,NSoftware
e-2,2026-05-25,09:00:00,10:30:00,5400,good row,Animo,NSoftware
";
    let (status, body) = post_preview(&state, bad_csv, Some("animo")).await;
    assert_eq!(status, StatusCode::OK, "body={body}");
    assert_eq!(body["totalRows"], 2);
    assert_eq!(body["validRows"], 1);
    let errors = body["errorRows"].as_array().unwrap();
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0]["row"], 2);
    assert!(errors[0]["message"]
        .as_str()
        .unwrap()
        .contains("not-a-date"));
}

#[tokio::test]
async fn commit_rejects_unknown_session() {
    let state = build_test_state().await;
    let (status, _) = post_commit(&state, "no-such-session").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn preview_rejects_missing_file_field() {
    let state = build_test_state().await;
    let boundary = "ANIMOTESTBOUNDARY";
    // Body with no `file` field at all.
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"source_format\"\r\n\r\n");
    body.extend_from_slice(b"animo");
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let req = Request::builder()
        .method("POST")
        .uri("/api/import/csv/preview")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))
        .unwrap();
    let app = build_app(state.clone());
    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn preview_explicit_format_overrides_detection() {
    let state = build_test_state().await;
    // Headers that wouldn't auto-detect to animo: minimal animo-format
    // file omitting `entry_id` and `duration_seconds`.
    let csv = "\
date,start_time,end_time,description,project_name,client_name
2026-05-25,09:00:00,10:30:00,manual hint,Animo,NSoftware
";
    let (status, body) = post_preview(&state, csv, Some("animo")).await;
    assert_eq!(status, StatusCode::OK, "body={body}");
    assert_eq!(body["format"], "animo");
    assert_eq!(body["validRows"], 1);
}
