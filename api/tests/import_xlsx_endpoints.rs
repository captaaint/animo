// =====================================================================================================================
// End-to-end tests for /api/import/xlsx/{preview,commit}.
// =====================================================================================================================
//
// Generates fixture workbooks in-memory with `rust_xlsxwriter` so the
// tests stay self-contained — no binary fixtures to drift away from the
// schema. The endpoint shares its post-parse pipeline with the CSV
// importer (see `import_endpoints.rs`), so we focus the assertions on
// what XLSX changes: cell-type coercion (dates, numbers, booleans),
// sheet selection, and that commit lands the right rows in the DB.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use animo_api::{build_app, AppState, Config};
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use chrono::{Datelike, NaiveDate};
use rust_xlsxwriter::{ExcelDateTime, Format, Workbook};
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

fn multipart_body(boundary: &str, file_contents: &[u8], format: Option<&str>) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        b"Content-Disposition: form-data; name=\"file\"; filename=\"upload.xlsx\"\r\n\
          Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n",
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

async fn post(state: &AppState, uri: &str, body: Body, content_type: &str) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", content_type)
        .body(body)
        .unwrap();
    let app = build_app(state.clone());
    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), 4 * 1024 * 1024).await.unwrap();
    let json: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, json)
}

async fn post_preview_xlsx(
    state: &AppState,
    xlsx_bytes: &[u8],
    source_format: Option<&str>,
    sheet_label: &str,
) -> (StatusCode, Value) {
    let boundary = "ANIMOXLSXBOUNDARY";
    let body = multipart_body(boundary, xlsx_bytes, source_format);
    let ct = format!("multipart/form-data; boundary={boundary}");
    let (status, json) = post(state, "/api/import/xlsx/preview", Body::from(body), &ct).await;
    assert!(
        status == StatusCode::OK || status == StatusCode::BAD_REQUEST,
        "{sheet_label}: unexpected status {status} body={json}"
    );
    (status, json)
}

async fn post_commit_xlsx(state: &AppState, session_id: &str) -> (StatusCode, Value) {
    let body = serde_json::json!({ "sessionId": session_id }).to_string();
    post(
        state,
        "/api/import/xlsx/commit",
        Body::from(body),
        "application/json",
    )
    .await
}

/// Build a workbook with the Animo schema header row. Sheet name and
/// row payload are caller-controlled so each test can shape its own
/// fixture without a separate builder per scenario.
fn build_animo_workbook(sheet_name: &str, rows: &[AnimoRow]) -> Vec<u8> {
    let mut workbook = Workbook::new();
    let sheet = workbook
        .add_worksheet()
        .set_name(sheet_name)
        .expect("set sheet name");

    const HEADERS: [&str; 14] = [
        "entry_id",
        "date",
        "start_time",
        "end_time",
        "duration_seconds",
        "duration_formatted",
        "description",
        "project_name",
        "client_name",
        "tags",
        "billable",
        "hourly_rate",
        "currency",
        "amount",
    ];
    for (col, header) in HEADERS.iter().enumerate() {
        sheet
            .write_string(0, col as u16, *header)
            .expect("write header");
    }

    let date_format = Format::new().set_num_format("yyyy-mm-dd");
    let time_format = Format::new().set_num_format("hh:mm:ss");

    for (i, row) in rows.iter().enumerate() {
        let r = (i + 1) as u32;
        sheet.write_string(r, 0, &row.entry_id).unwrap();

        let date_excel = ExcelDateTime::from_ymd(
            row.date.year() as u16,
            row.date.month() as u8,
            row.date.day() as u8,
        )
        .expect("excel date");
        sheet
            .write_with_format(r, 1, &date_excel, &date_format)
            .unwrap();

        // Use HH:MM:SS strings for time columns: writing as a true time
        // value in rust_xlsxwriter is awkward, and the parser's ISO/
        // fallback path already covers the typical XLSX time output.
        let start_excel =
            ExcelDateTime::from_hms(row.start_h, row.start_m, row.start_s as f64).unwrap();
        sheet
            .write_with_format(r, 2, &start_excel, &time_format)
            .unwrap();
        let end_excel = ExcelDateTime::from_hms(row.end_h, row.end_m, row.end_s as f64).unwrap();
        sheet
            .write_with_format(r, 3, &end_excel, &time_format)
            .unwrap();

        sheet
            .write_number(r, 4, row.duration_seconds as f64)
            .unwrap();
        sheet.write_string(r, 5, "").unwrap();
        sheet.write_string(r, 6, &row.description).unwrap();
        sheet.write_string(r, 7, &row.project_name).unwrap();
        sheet.write_string(r, 8, &row.client_name).unwrap();
        sheet.write_string(r, 9, &row.tags).unwrap();
        sheet.write_boolean(r, 10, row.billable).unwrap();
        sheet.write_number(r, 11, row.hourly_rate).unwrap();
        sheet.write_string(r, 12, &row.currency).unwrap();
        sheet.write_number(r, 13, 0.0).unwrap();
    }

    workbook.save_to_buffer().expect("save xlsx")
}

#[derive(Clone)]
struct AnimoRow {
    entry_id: String,
    date: NaiveDate,
    start_h: u16,
    start_m: u8,
    start_s: u8,
    end_h: u16,
    end_m: u8,
    end_s: u8,
    duration_seconds: i64,
    description: String,
    project_name: String,
    client_name: String,
    tags: String,
    billable: bool,
    hourly_rate: f64,
    currency: String,
}

fn sample_rows() -> Vec<AnimoRow> {
    vec![
        AnimoRow {
            entry_id: "e-1".into(),
            date: NaiveDate::from_ymd_opt(2026, 5, 25).unwrap(),
            start_h: 9,
            start_m: 0,
            start_s: 0,
            end_h: 10,
            end_m: 30,
            end_s: 0,
            duration_seconds: 5400,
            description: "Worked on xlsx import".into(),
            project_name: "Animo".into(),
            client_name: "NSoftware".into(),
            tags: "deep work".into(),
            billable: true,
            hourly_rate: 60.0,
            currency: "EUR".into(),
        },
        AnimoRow {
            entry_id: "e-2".into(),
            date: NaiveDate::from_ymd_opt(2026, 5, 25).unwrap(),
            start_h: 11,
            start_m: 0,
            start_s: 0,
            end_h: 12,
            end_m: 0,
            end_s: 0,
            duration_seconds: 3600,
            description: "Sync".into(),
            project_name: "Animo".into(),
            client_name: "NSoftware".into(),
            tags: "planning".into(),
            billable: false,
            hourly_rate: 0.0,
            currency: "EUR".into(),
        },
    ]
}

#[tokio::test]
async fn xlsx_preview_handles_typed_cells() {
    let state = build_test_state().await;
    let xlsx = build_animo_workbook("Entries", &sample_rows());
    let (status, body) = post_preview_xlsx(&state, &xlsx, None, "typed").await;
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
}

#[tokio::test]
async fn xlsx_commit_inserts_entries() {
    let state = build_test_state().await;
    let xlsx = build_animo_workbook("Entries", &sample_rows());

    let (_, preview) = post_preview_xlsx(&state, &xlsx, None, "commit-1").await;
    let session_id = preview["sessionId"].as_str().unwrap().to_string();

    let (status, commit) = post_commit_xlsx(&state, &session_id).await;
    assert_eq!(status, StatusCode::OK, "commit body={commit}");
    assert_eq!(commit["entriesCreated"], 2);
    assert_eq!(commit["clientsCreated"], 1);
    assert_eq!(commit["projectsCreated"], 1);
    assert_eq!(commit["tagsCreated"], 2);

    let (entries,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM time_entries")
        .fetch_one(&state.db)
        .await
        .unwrap();
    let (clients,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clients")
        .fetch_one(&state.db)
        .await
        .unwrap();
    assert_eq!(entries, 2);
    assert_eq!(clients, 1);
}

#[tokio::test]
async fn xlsx_prefers_entries_sheet_over_first_sheet() {
    let state = build_test_state().await;

    // Build a workbook where the first sheet has unrelated junk and the
    // proper data lives in a sheet named "Entries". If the endpoint
    // picked the first sheet, format detection would fail and totalRows
    // would be wrong.
    let mut workbook = Workbook::new();
    let junk = workbook.add_worksheet().set_name("Sheet1").unwrap();
    junk.write_string(0, 0, "nothing here").unwrap();
    let entries = workbook.add_worksheet().set_name("Entries").unwrap();
    const HEADERS: [&str; 14] = [
        "entry_id",
        "date",
        "start_time",
        "end_time",
        "duration_seconds",
        "duration_formatted",
        "description",
        "project_name",
        "client_name",
        "tags",
        "billable",
        "hourly_rate",
        "currency",
        "amount",
    ];
    for (col, header) in HEADERS.iter().enumerate() {
        entries.write_string(0, col as u16, *header).unwrap();
    }
    let row = &sample_rows()[0];
    entries.write_string(1, 0, &row.entry_id).unwrap();
    entries.write_string(1, 1, "2026-05-25").unwrap();
    entries.write_string(1, 2, "09:00:00").unwrap();
    entries.write_string(1, 3, "10:30:00").unwrap();
    entries
        .write_number(1, 4, row.duration_seconds as f64)
        .unwrap();
    entries.write_string(1, 5, "").unwrap();
    entries.write_string(1, 6, &row.description).unwrap();
    entries.write_string(1, 7, &row.project_name).unwrap();
    entries.write_string(1, 8, &row.client_name).unwrap();
    entries.write_string(1, 9, &row.tags).unwrap();
    entries.write_boolean(1, 10, row.billable).unwrap();
    entries.write_number(1, 11, row.hourly_rate).unwrap();
    entries.write_string(1, 12, &row.currency).unwrap();
    entries.write_number(1, 13, 0.0).unwrap();

    let bytes = workbook.save_to_buffer().unwrap();
    let (status, body) = post_preview_xlsx(&state, &bytes, None, "sheet-select").await;
    assert_eq!(status, StatusCode::OK, "body={body}");
    assert_eq!(body["totalRows"], 1);
    assert_eq!(body["validRows"], 1);
}

#[tokio::test]
async fn xlsx_falls_back_to_first_sheet_when_no_entries_sheet() {
    let state = build_test_state().await;
    let xlsx = build_animo_workbook("WhateverName", &sample_rows()[..1]);
    let (status, body) = post_preview_xlsx(&state, &xlsx, None, "first-sheet").await;
    assert_eq!(status, StatusCode::OK, "body={body}");
    assert_eq!(body["totalRows"], 1);
    assert_eq!(body["validRows"], 1);
}

#[tokio::test]
async fn xlsx_rejects_empty_workbook() {
    let state = build_test_state().await;
    let mut workbook = Workbook::new();
    let _ = workbook.add_worksheet().set_name("Empty").unwrap();
    let bytes = workbook.save_to_buffer().unwrap();
    let (status, body) = post_preview_xlsx(&state, &bytes, Some("animo"), "empty").await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body={body}");
}
