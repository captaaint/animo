//! Shared CSV/XLSX import parser infrastructure.
//!
//! The HTTP endpoints (tasks 14, 15) read uploaded files, hand a header row +
//! data rows to [`detect_format`] / [`parser_for`], and then call
//! [`ImportParser::parse_row`] per row followed by [`validate`].

use std::collections::{BTreeSet, HashMap, HashSet};

use axum::extract::{Multipart, State};
use axum::Json;
use chrono::{NaiveDate, NaiveTime};
use csv::StringRecord;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::users::LocalUser;

#[derive(Debug, Clone, PartialEq)]
pub struct ImportRow {
    pub source_id: Option<String>,
    pub date: NaiveDate,
    pub start_time: Option<NaiveTime>,
    pub end_time: Option<NaiveTime>,
    pub duration_seconds: Option<i64>,
    pub description: String,
    pub project_name: Option<String>,
    pub client_name: Option<String>,
    pub tags: Vec<String>,
    pub billable: bool,
    pub hourly_rate: Option<f64>,
    pub currency: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceFormat {
    Animo,
    Toggl,
    Clockify,
    Harvest,
}

impl SourceFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            SourceFormat::Animo => "animo",
            SourceFormat::Toggl => "toggl",
            SourceFormat::Clockify => "clockify",
            SourceFormat::Harvest => "harvest",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "animo" => Some(SourceFormat::Animo),
            "toggl" => Some(SourceFormat::Toggl),
            "clockify" => Some(SourceFormat::Clockify),
            "harvest" => Some(SourceFormat::Harvest),
            _ => None,
        }
    }
}

#[derive(Debug, Error, PartialEq)]
pub enum ImportError {
    #[error("missing required column: {0}")]
    MissingColumn(String),
    #[error("invalid value in column '{column}': {message}")]
    InvalidValue { column: String, message: String },
    #[error("missing required field: {0}")]
    MissingField(String),
    #[error("could not detect source format from headers")]
    UnknownFormat,
}

fn normalize_header(raw: &str) -> String {
    raw.trim().to_lowercase()
}

/// Case-insensitive header → column-index lookup over a CSV header row.
pub struct HeaderIndex {
    map: HashMap<String, usize>,
}

impl HeaderIndex {
    pub fn from_record(record: &StringRecord) -> Self {
        let map = record
            .iter()
            .enumerate()
            .map(|(i, h)| (normalize_header(h), i))
            .collect();
        Self { map }
    }

    /// Returns the trimmed cell value for the named header, or `None` if the
    /// header is absent or the cell is empty.
    pub fn get<'a>(&self, record: &'a StringRecord, name: &str) -> Option<&'a str> {
        let idx = self.map.get(&normalize_header(name))?;
        let raw = record.get(*idx)?.trim();
        if raw.is_empty() {
            None
        } else {
            Some(raw)
        }
    }

    pub fn has(&self, name: &str) -> bool {
        self.map.contains_key(&normalize_header(name))
    }

    pub fn starts_with(&self, prefix: &str) -> bool {
        let p = normalize_header(prefix);
        self.map.keys().any(|k| k.starts_with(&p))
    }
}

pub trait ImportParser: Send + Sync {
    fn parse_row(&self, record: &StringRecord) -> Result<ImportRow, ImportError>;
}

// ---------------- Utility parsers ----------------

pub fn parse_date(s: &str) -> Result<NaiveDate, ImportError> {
    const FORMATS: &[&str] = &["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d"];
    let trimmed = s.trim();
    for fmt in FORMATS {
        if let Ok(d) = NaiveDate::parse_from_str(trimmed, fmt) {
            return Ok(d);
        }
    }
    if let Some(date_part) = trimmed.get(..10) {
        if let Ok(d) = NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
            return Ok(d);
        }
    }
    Err(ImportError::InvalidValue {
        column: "date".into(),
        message: format!("cannot parse '{s}'"),
    })
}

pub fn parse_time(s: &str) -> Result<NaiveTime, ImportError> {
    const FORMATS: &[&str] = &["%H:%M:%S", "%H:%M", "%I:%M:%S %p", "%I:%M %p"];
    let trimmed = s.trim();
    for fmt in FORMATS {
        if let Ok(t) = NaiveTime::parse_from_str(trimmed, fmt) {
            return Ok(t);
        }
    }
    // Fallback for ISO datetime strings (`2026-05-25T09:30:00`,
    // `2026-05-25T09:30:00.000Z`, …). XLSX `DateTime` cells get serialized
    // this way by the cell-to-string converter, and we want the time
    // column to find its hours-minutes-seconds inside that envelope.
    if let Some(t_pos) = trimmed.find('T').or_else(|| trimmed.find(' ')) {
        let raw = trimmed.get(t_pos + 1..).unwrap_or("");
        let raw = raw.trim_end_matches('Z');
        let raw = raw.split('.').next().unwrap_or(raw); // strip fractional seconds
        if let Ok(t) = NaiveTime::parse_from_str(raw, "%H:%M:%S") {
            return Ok(t);
        }
        if let Ok(t) = NaiveTime::parse_from_str(raw, "%H:%M") {
            return Ok(t);
        }
    }
    Err(ImportError::InvalidValue {
        column: "time".into(),
        message: format!("cannot parse '{s}'"),
    })
}

pub fn parse_duration_seconds(s: &str) -> Result<i64, ImportError> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Err(ImportError::InvalidValue {
            column: "duration".into(),
            message: "empty".into(),
        });
    }
    if let Ok(n) = trimmed.parse::<i64>() {
        if n >= 0 {
            return Ok(n);
        }
    }
    if trimmed.contains(':') {
        let parts: Vec<&str> = trimmed.split(':').collect();
        let to_int = |p: &str| {
            p.parse::<i64>().map_err(|_| ImportError::InvalidValue {
                column: "duration".into(),
                message: format!("'{trimmed}' is not HH:MM[:SS]"),
            })
        };
        return match parts.len() {
            2 => Ok(to_int(parts[0])? * 3600 + to_int(parts[1])? * 60),
            3 => Ok(to_int(parts[0])? * 3600 + to_int(parts[1])? * 60 + to_int(parts[2])?),
            _ => Err(ImportError::InvalidValue {
                column: "duration".into(),
                message: format!("'{trimmed}' is not HH:MM[:SS]"),
            }),
        };
    }
    if let Ok(hours) = trimmed.parse::<f64>() {
        if hours.is_finite() && hours >= 0.0 {
            return Ok((hours * 3600.0).round() as i64);
        }
    }
    Err(ImportError::InvalidValue {
        column: "duration".into(),
        message: format!("cannot parse '{trimmed}'"),
    })
}

pub fn parse_bool_flag(s: &str) -> bool {
    matches!(
        s.trim().to_lowercase().as_str(),
        "true" | "yes" | "y" | "1" | "billable"
    )
}

pub fn parse_tag_list(s: &str) -> Vec<String> {
    s.split(',')
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

fn parse_f64_lenient(s: &str) -> Option<f64> {
    let raw = s.trim();
    if raw.is_empty() {
        return None;
    }
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-' || *c == ',')
        .collect();
    let cleaned = cleaned.replace(',', "");
    cleaned.parse::<f64>().ok()
}

// ---------------- Format detection ----------------

pub fn detect_format(headers: &StringRecord) -> Option<SourceFormat> {
    let index = HeaderIndex::from_record(headers);

    if index.has("entry_id") && index.has("duration_seconds") {
        return Some(SourceFormat::Animo);
    }
    if index.has("notes") && index.has("hours") && index.has("first name") {
        return Some(SourceFormat::Harvest);
    }
    if index.has("start date")
        && index.has("start time")
        && (index.starts_with("billable amount")
            || index.starts_with("duration (")
            || index.starts_with("billable rate"))
    {
        return Some(SourceFormat::Clockify);
    }
    if index.has("user") && index.has("email") && index.has("start date") && index.has("duration") {
        return Some(SourceFormat::Toggl);
    }
    None
}

pub fn parser_for(format: SourceFormat, headers: &StringRecord) -> Box<dyn ImportParser> {
    match format {
        SourceFormat::Animo => Box::new(AnimoParser::new(headers)),
        SourceFormat::Toggl => Box::new(TogglParser::new(headers)),
        SourceFormat::Clockify => Box::new(ClockifyParser::new(headers)),
        SourceFormat::Harvest => Box::new(HarvestParser::new(headers)),
    }
}

// ---------------- Animo parser ----------------

pub struct AnimoParser {
    headers: HeaderIndex,
}

impl AnimoParser {
    pub fn new(headers: &StringRecord) -> Self {
        Self {
            headers: HeaderIndex::from_record(headers),
        }
    }
}

impl ImportParser for AnimoParser {
    fn parse_row(&self, record: &StringRecord) -> Result<ImportRow, ImportError> {
        let date_str = self
            .headers
            .get(record, "date")
            .ok_or_else(|| ImportError::MissingField("date".into()))?;
        let date = parse_date(date_str)?;

        let start_time = self
            .headers
            .get(record, "start_time")
            .map(parse_time)
            .transpose()?;
        let end_time = self
            .headers
            .get(record, "end_time")
            .map(parse_time)
            .transpose()?;
        let duration_seconds = self
            .headers
            .get(record, "duration_seconds")
            .map(parse_duration_seconds)
            .transpose()?;

        Ok(ImportRow {
            source_id: self.headers.get(record, "entry_id").map(str::to_string),
            date,
            start_time,
            end_time,
            duration_seconds,
            description: self
                .headers
                .get(record, "description")
                .unwrap_or("")
                .to_string(),
            project_name: self.headers.get(record, "project_name").map(str::to_string),
            client_name: self.headers.get(record, "client_name").map(str::to_string),
            tags: self
                .headers
                .get(record, "tags")
                .map(parse_tag_list)
                .unwrap_or_default(),
            billable: self
                .headers
                .get(record, "billable")
                .map(parse_bool_flag)
                .unwrap_or(false),
            hourly_rate: self
                .headers
                .get(record, "hourly_rate")
                .and_then(parse_f64_lenient),
            currency: self.headers.get(record, "currency").map(str::to_string),
        })
    }
}

// ---------------- Toggl parser ----------------

pub struct TogglParser {
    headers: HeaderIndex,
}

impl TogglParser {
    pub fn new(headers: &StringRecord) -> Self {
        Self {
            headers: HeaderIndex::from_record(headers),
        }
    }
}

impl ImportParser for TogglParser {
    fn parse_row(&self, record: &StringRecord) -> Result<ImportRow, ImportError> {
        let date_str = self
            .headers
            .get(record, "start date")
            .ok_or_else(|| ImportError::MissingField("Start date".into()))?;
        let date = parse_date(date_str)?;

        let start_time = self
            .headers
            .get(record, "start time")
            .map(parse_time)
            .transpose()?;
        let end_time = self
            .headers
            .get(record, "end time")
            .map(parse_time)
            .transpose()?;
        let duration_seconds = self
            .headers
            .get(record, "duration")
            .map(parse_duration_seconds)
            .transpose()?;

        Ok(ImportRow {
            source_id: None,
            date,
            start_time,
            end_time,
            duration_seconds,
            description: self
                .headers
                .get(record, "description")
                .unwrap_or("")
                .to_string(),
            project_name: self.headers.get(record, "project").map(str::to_string),
            client_name: self.headers.get(record, "client").map(str::to_string),
            tags: self
                .headers
                .get(record, "tags")
                .map(parse_tag_list)
                .unwrap_or_default(),
            billable: self
                .headers
                .get(record, "billable")
                .map(parse_bool_flag)
                .unwrap_or(false),
            hourly_rate: None,
            currency: None,
        })
    }
}

// ---------------- Clockify parser ----------------

pub struct ClockifyParser {
    headers: HeaderIndex,
}

impl ClockifyParser {
    pub fn new(headers: &StringRecord) -> Self {
        Self {
            headers: HeaderIndex::from_record(headers),
        }
    }

    fn find_currency(&self) -> Option<String> {
        for key in self.headers.map.keys() {
            if let Some(suffix) = key.strip_prefix("billable rate (") {
                if let Some(code) = suffix.strip_suffix(')') {
                    return Some(code.to_uppercase());
                }
            }
        }
        None
    }

    fn read_rate(&self, record: &StringRecord) -> Option<f64> {
        let key = self
            .headers
            .map
            .keys()
            .find(|k| k.starts_with("billable rate"))?;
        let idx = *self.headers.map.get(key)?;
        let raw = record.get(idx)?;
        parse_f64_lenient(raw)
    }
}

impl ImportParser for ClockifyParser {
    fn parse_row(&self, record: &StringRecord) -> Result<ImportRow, ImportError> {
        let date_str = self
            .headers
            .get(record, "start date")
            .ok_or_else(|| ImportError::MissingField("Start Date".into()))?;
        let date = parse_date(date_str)?;

        let start_time = self
            .headers
            .get(record, "start time")
            .map(parse_time)
            .transpose()?;
        let end_time = self
            .headers
            .get(record, "end time")
            .map(parse_time)
            .transpose()?;
        let duration_seconds = self
            .headers
            .get(record, "duration (h)")
            .or_else(|| self.headers.get(record, "duration"))
            .or_else(|| self.headers.get(record, "duration (decimal)"))
            .map(parse_duration_seconds)
            .transpose()?;

        Ok(ImportRow {
            source_id: None,
            date,
            start_time,
            end_time,
            duration_seconds,
            description: self
                .headers
                .get(record, "description")
                .unwrap_or("")
                .to_string(),
            project_name: self.headers.get(record, "project").map(str::to_string),
            client_name: self.headers.get(record, "client").map(str::to_string),
            tags: self
                .headers
                .get(record, "tags")
                .map(parse_tag_list)
                .unwrap_or_default(),
            billable: self
                .headers
                .get(record, "billable")
                .map(parse_bool_flag)
                .unwrap_or(false),
            hourly_rate: self.read_rate(record),
            currency: self.find_currency(),
        })
    }
}

// ---------------- Harvest parser ----------------

pub struct HarvestParser {
    headers: HeaderIndex,
}

impl HarvestParser {
    pub fn new(headers: &StringRecord) -> Self {
        Self {
            headers: HeaderIndex::from_record(headers),
        }
    }
}

impl ImportParser for HarvestParser {
    fn parse_row(&self, record: &StringRecord) -> Result<ImportRow, ImportError> {
        let date_str = self
            .headers
            .get(record, "date")
            .ok_or_else(|| ImportError::MissingField("Date".into()))?;
        let date = parse_date(date_str)?;

        let duration_seconds = self
            .headers
            .get(record, "hours")
            .map(parse_duration_seconds)
            .transpose()?;

        Ok(ImportRow {
            source_id: None,
            date,
            start_time: None,
            end_time: None,
            duration_seconds,
            description: self.headers.get(record, "notes").unwrap_or("").to_string(),
            project_name: self.headers.get(record, "project").map(str::to_string),
            client_name: self.headers.get(record, "client").map(str::to_string),
            tags: Vec::new(),
            billable: self
                .headers
                .get(record, "billable?")
                .or_else(|| self.headers.get(record, "billable"))
                .map(parse_bool_flag)
                .unwrap_or(false),
            hourly_rate: self
                .headers
                .get(record, "billable rate")
                .and_then(parse_f64_lenient),
            currency: self
                .headers
                .get(record, "currency")
                .map(|s| s.to_uppercase()),
        })
    }
}

// ---------------- Validation ----------------

/// Verifies that a parsed row has the minimum data required for insertion: a
/// non-negative duration plus either a duration value or a start/end pair.
pub fn validate(row: &ImportRow) -> Result<(), ImportError> {
    if row.duration_seconds.is_none() && (row.start_time.is_none() || row.end_time.is_none()) {
        return Err(ImportError::MissingField(
            "duration_seconds or (start_time + end_time)".into(),
        ));
    }
    if let Some(d) = row.duration_seconds {
        if d < 0 {
            return Err(ImportError::InvalidValue {
                column: "duration_seconds".into(),
                message: format!("must be non-negative, got {d}"),
            });
        }
    }
    Ok(())
}

// =====================================================================================================================
// HTTP endpoints
// =====================================================================================================================
//
// Two-phase upload to give the user a confirmation step:
//
//   1. POST /api/import/csv/preview  — multipart upload of the file.
//      We parse the whole thing, classify every row (valid / error /
//      duplicate), figure out which clients/projects/tags would have to
//      be created, and stash the parsed rows in an in-memory session.
//      The response is a summary the UI can show as a confirmation
//      sheet.
//
//   2. POST /api/import/csv/commit   — JSON body referencing the session.
//      We re-validate the entities (they may have appeared meanwhile —
//      e.g. the user created a project manually after seeing the preview)
//      and insert the entries inside a single SQLite transaction. The
//      session is consumed: re-submitting the same session_id 404s.
//
// Session lifetime: in-memory map on [`AppState::import_sessions`]. Two
// guards keep it from growing unbounded:
//   - sessions older than `SESSION_TTL` are pruned each time we touch
//     the map (cheap lazy GC, no background task);
//   - successful commits remove the session, so the happy path leaves
//     nothing behind.
//
// Upload size: capped at [`MAX_UPLOAD_BYTES`]. axum's `Multipart` will
// buffer fields in memory; an unconstrained import endpoint is a trivial
// DoS vector even on a single-user desktop deployment.

const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024;
const SESSION_TTL: std::time::Duration = std::time::Duration::from_secs(30 * 60);

/// Stored between preview and commit. Holds the parsed rows so commit
/// doesn't need the file again — that would force the UI to keep the
/// upload in memory across the confirmation step.
#[derive(Debug, Clone)]
pub struct PreviewSession {
    pub format: SourceFormat,
    pub created_at: std::time::Instant,
    pub user_id: String,
    pub valid_rows: Vec<ImportRow>,
    pub duplicate_rows: Vec<ImportRow>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RowError {
    pub row: usize,
    pub message: String,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EntitiesToCreate {
    pub clients: Vec<String>,
    pub projects: Vec<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResponse {
    pub session_id: String,
    pub format: String,
    pub total_rows: usize,
    pub valid_rows: usize,
    pub duplicate_warnings: usize,
    pub error_rows: Vec<RowError>,
    pub entities_to_create: EntitiesToCreate,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRequest {
    pub session_id: String,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitResponse {
    pub entries_created: usize,
    pub clients_created: usize,
    pub projects_created: usize,
    pub tags_created: usize,
    pub duplicates_skipped: usize,
}

/// Convert a parsed row into the ISO timestamps the database stores.
/// Mirrors how the manual entry endpoint normalises start/end so the
/// duplicate check downstream compares apples to apples.
///
/// Rules:
///   - both start and end present → use them on the row's date
///   - only duration present → start at midnight, end = start + duration
///   - start present but no end → end = start + duration (if duration
///     is also present); otherwise validation already rejected the row
fn row_to_iso_range(row: &ImportRow) -> Option<(String, String, i64)> {
    let date = row.date;
    match (row.start_time, row.end_time, row.duration_seconds) {
        (Some(start), Some(end), _) => {
            let start_dt = date.and_time(start);
            let end_dt = date.and_time(end);
            let duration = (end_dt - start_dt).num_seconds();
            if duration < 0 {
                return None;
            }
            Some((iso_z(start_dt), iso_z(end_dt), duration))
        }
        (Some(start), None, Some(duration)) if duration >= 0 => {
            let start_dt = date.and_time(start);
            let end_dt = start_dt + chrono::Duration::seconds(duration);
            Some((iso_z(start_dt), iso_z(end_dt), duration))
        }
        (None, _, Some(duration)) if duration >= 0 => {
            let start_dt = date.and_hms_opt(0, 0, 0)?;
            let end_dt = start_dt + chrono::Duration::seconds(duration);
            Some((iso_z(start_dt), iso_z(end_dt), duration))
        }
        _ => None,
    }
}

fn iso_z(dt: chrono::NaiveDateTime) -> String {
    // Match the format used elsewhere in the API (`...Z` with millis).
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// Pull the single `file` field out of a multipart upload and return its
/// bytes plus an optional `source_format` field. Other fields are ignored
/// (forwards-compatible with future flags). Bails if the file is missing,
/// empty, or larger than [`MAX_UPLOAD_BYTES`].
async fn read_upload(mut multipart: Multipart) -> AppResult<(Vec<u8>, Option<String>)> {
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut source_format: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart read: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("read upload: {e}")))?;
                if bytes.len() > MAX_UPLOAD_BYTES {
                    return Err(AppError::BadRequest(format!(
                        "file exceeds {MAX_UPLOAD_BYTES} bytes"
                    )));
                }
                file_bytes = Some(bytes.to_vec());
            }
            "source_format" | "sourceFormat" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("read source_format: {e}")))?;
                if !text.trim().is_empty() {
                    source_format = Some(text);
                }
            }
            _ => {
                // Drain and discard — leaving the field unread leaks the
                // underlying body bytes.
                let _ = field.bytes().await;
            }
        }
    }

    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("missing 'file' field".into()))?;
    if bytes.is_empty() {
        return Err(AppError::BadRequest("uploaded file is empty".into()));
    }
    Ok((bytes, source_format))
}

fn prune_expired(sessions: &mut HashMap<String, PreviewSession>) {
    let now = std::time::Instant::now();
    sessions.retain(|_, s| now.duration_since(s.created_at) < SESSION_TTL);
}

/// Result of feeding a parsed record stream through the preview pipeline.
/// Shared by [`preview_csv`] and [`preview_xlsx`] so the duplicate/entity
/// logic only lives in one place.
struct ProcessedRows {
    total_rows: usize,
    valid_rows: Vec<ImportRow>,
    duplicate_rows: Vec<ImportRow>,
    error_rows: Vec<RowError>,
    new_clients: BTreeSet<String>,
    new_projects: BTreeSet<String>,
    new_tags: BTreeSet<String>,
}

/// Input to [`process_records`]. Each item is a `(display_row_number,
/// per-record-error)` pair — the row number is 1-based and includes the
/// header row, so the first data row is row 2 (matches how spreadsheet
/// UIs label things). `Err` strings come from the parser layer (e.g.
/// CSV reader I/O error) and are reported verbatim.
type RecordIter = Box<dyn Iterator<Item = (usize, Result<StringRecord, String>)> + Send>;

async fn process_records(
    state: &AppState,
    user_id: &str,
    parser: &dyn ImportParser,
    records: RecordIter,
) -> AppResult<ProcessedRows> {
    let known_clients = fetch_client_names(state, user_id).await?;
    let known_projects = fetch_project_names(state, user_id).await?;
    let known_tags = fetch_tag_names(state, user_id).await?;

    let mut out = ProcessedRows {
        total_rows: 0,
        valid_rows: Vec::new(),
        duplicate_rows: Vec::new(),
        error_rows: Vec::new(),
        new_clients: BTreeSet::new(),
        new_projects: BTreeSet::new(),
        new_tags: BTreeSet::new(),
    };

    for (display_row, result) in records {
        out.total_rows += 1;
        let record = match result {
            Ok(r) => r,
            Err(msg) => {
                out.error_rows.push(RowError {
                    row: display_row,
                    message: msg,
                });
                continue;
            }
        };
        let parsed = match parser.parse_row(&record) {
            Ok(r) => r,
            Err(e) => {
                out.error_rows.push(RowError {
                    row: display_row,
                    message: e.to_string(),
                });
                continue;
            }
        };
        if let Err(e) = validate(&parsed) {
            out.error_rows.push(RowError {
                row: display_row,
                message: e.to_string(),
            });
            continue;
        }
        let Some((start_iso, end_iso, _)) = row_to_iso_range(&parsed) else {
            out.error_rows.push(RowError {
                row: display_row,
                message: "could not derive start/end timestamps".into(),
            });
            continue;
        };
        if is_duplicate(state, user_id, &start_iso, &end_iso, &parsed.description).await? {
            out.duplicate_rows.push(parsed);
            continue;
        }

        if let Some(name) = parsed.client_name.as_deref() {
            let normalized = name.trim();
            if !normalized.is_empty() && !known_clients.contains(&normalized.to_lowercase()) {
                out.new_clients.insert(normalized.to_string());
            }
        }
        if let Some(name) = parsed.project_name.as_deref() {
            let normalized = name.trim();
            if !normalized.is_empty() && !known_projects.contains(&normalized.to_lowercase()) {
                out.new_projects.insert(normalized.to_string());
            }
        }
        for tag in &parsed.tags {
            let normalized = tag.trim();
            if !normalized.is_empty() && !known_tags.contains(&normalized.to_lowercase()) {
                out.new_tags.insert(normalized.to_string());
            }
        }
        out.valid_rows.push(parsed);
    }
    Ok(out)
}

/// Wraps `processed` into a [`PreviewSession`] + [`PreviewResponse`],
/// inserts the session into app state, and prunes expired ones along
/// the way. The two preview endpoints diverge only in *how* they build
/// the `processed` value; everything after that is the same.
fn finalize_preview(
    state: &AppState,
    user_id: &str,
    format: SourceFormat,
    processed: ProcessedRows,
) -> AppResult<PreviewResponse> {
    let session_id = Uuid::new_v4().to_string();
    let valid_count = processed.valid_rows.len();
    let duplicate_count = processed.duplicate_rows.len();

    let session = PreviewSession {
        format,
        created_at: std::time::Instant::now(),
        user_id: user_id.to_string(),
        valid_rows: processed.valid_rows,
        duplicate_rows: processed.duplicate_rows,
    };
    {
        let mut sessions = state
            .import_sessions
            .lock()
            .map_err(|_| AppError::Internal(anyhow::anyhow!("import session mutex poisoned")))?;
        prune_expired(&mut sessions);
        sessions.insert(session_id.clone(), session);
    }

    Ok(PreviewResponse {
        session_id,
        format: format.as_str().to_string(),
        total_rows: processed.total_rows,
        valid_rows: valid_count,
        duplicate_warnings: duplicate_count,
        error_rows: processed.error_rows,
        entities_to_create: EntitiesToCreate {
            clients: processed.new_clients.into_iter().collect(),
            projects: processed.new_projects.into_iter().collect(),
            tags: processed.new_tags.into_iter().collect(),
        },
    })
}

pub async fn preview_csv(
    State(state): State<AppState>,
    user: LocalUser,
    multipart: Multipart,
) -> AppResult<Json<PreviewResponse>> {
    let (bytes, source_format_hint) = read_upload(multipart).await?;

    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(bytes.as_slice());

    let headers = reader
        .headers()
        .map_err(|e| AppError::BadRequest(format!("read headers: {e}")))?
        .clone();

    let format = resolve_format(source_format_hint.as_deref(), &headers)?;
    let parser = parser_for(format, &headers);

    // Collect now so the iterator passed to `process_records` is owned —
    // `csv::Reader` borrows from `bytes`, and the inner loop is async.
    let raw_records: Vec<(usize, Result<StringRecord, String>)> = reader
        .records()
        .enumerate()
        .map(|(idx, result)| {
            // 1-based row number including the header row.
            let display_row = idx + 2;
            (
                display_row,
                result.map_err(|e| format!("csv parse error: {e}")),
            )
        })
        .collect();

    let processed = process_records(
        &state,
        &user.id,
        parser.as_ref(),
        Box::new(raw_records.into_iter()),
    )
    .await?;
    let response = finalize_preview(&state, &user.id, format, processed)?;
    Ok(Json(response))
}

/// XLSX counterpart of [`preview_csv`]. Reuses `read_upload`,
/// `process_records`, and `finalize_preview`; the only XLSX-specific
/// work is picking a worksheet and turning calamine `Data` cells into
/// the [`StringRecord`] shape the parsers expect.
pub async fn preview_xlsx(
    State(state): State<AppState>,
    user: LocalUser,
    multipart: Multipart,
) -> AppResult<Json<PreviewResponse>> {
    let (bytes, source_format_hint) = read_upload(multipart).await?;
    let (headers, data_rows) = read_xlsx_rows(bytes)?;
    let format = resolve_format(source_format_hint.as_deref(), &headers)?;
    let parser = parser_for(format, &headers);

    let iter: Vec<(usize, Result<StringRecord, String>)> = data_rows
        .into_iter()
        .enumerate()
        .map(|(idx, row)| (idx + 2, Ok(row)))
        .collect();

    let processed = process_records(
        &state,
        &user.id,
        parser.as_ref(),
        Box::new(iter.into_iter()),
    )
    .await?;
    let response = finalize_preview(&state, &user.id, format, processed)?;
    Ok(Json(response))
}

/// Open the uploaded bytes as an XLSX workbook, pick the worksheet, and
/// hand back the header row + data rows already in [`StringRecord`] form.
///
/// Sheet selection mirrors the PRD: prefer a sheet named `Entries`
/// (case-insensitive), otherwise fall back to the first sheet.
fn read_xlsx_rows(bytes: Vec<u8>) -> AppResult<(StringRecord, Vec<StringRecord>)> {
    use calamine::{Reader, Xlsx};
    use std::io::Cursor;

    let cursor = Cursor::new(bytes);
    let mut workbook: Xlsx<_> =
        Xlsx::new(cursor).map_err(|e| AppError::BadRequest(format!("open xlsx: {e}")))?;

    let sheet_names = workbook.sheet_names();
    if sheet_names.is_empty() {
        return Err(AppError::BadRequest("xlsx contains no worksheets".into()));
    }
    let preferred = sheet_names
        .iter()
        .find(|n| n.eq_ignore_ascii_case("Entries"))
        .cloned()
        .unwrap_or_else(|| sheet_names[0].clone());

    let range = workbook
        .worksheet_range(&preferred)
        .map_err(|e| AppError::BadRequest(format!("read sheet '{preferred}': {e}")))?;

    let mut rows_iter = range.rows();
    let header_row = rows_iter
        .next()
        .ok_or_else(|| AppError::BadRequest("xlsx sheet is empty".into()))?;
    let headers = row_to_record(header_row);
    let data_rows: Vec<StringRecord> = rows_iter
        .filter(|row| !row.iter().all(|c| matches!(c, calamine::Data::Empty)))
        .map(row_to_record)
        .collect();
    Ok((headers, data_rows))
}

fn row_to_record(row: &[calamine::Data]) -> StringRecord {
    let mut rec = StringRecord::new();
    for cell in row {
        rec.push_field(&cell_to_string(cell));
    }
    rec
}

/// Convert a single calamine cell into the string form the parsers
/// expect. Dates and times go through ISO formatting so [`parse_date`]
/// and the ISO fallback in [`parse_time`] can pick them up uniformly.
fn cell_to_string(cell: &calamine::Data) -> String {
    use calamine::Data;
    match cell {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Int(n) => n.to_string(),
        Data::Float(f) => {
            // Strip trailing `.0` for whole numbers so "5400" beats "5400.0"
            // when fed to `parse_duration_seconds` (the parser handles both,
            // but the cleaner form is nicer in error messages).
            if f.fract() == 0.0 && f.is_finite() {
                format!("{:.0}", f)
            } else {
                f.to_string()
            }
        }
        Data::Bool(b) => if *b { "true" } else { "false" }.to_string(),
        Data::DateTime(dt) => match dt.as_datetime() {
            Some(ndt) => ndt.format("%Y-%m-%dT%H:%M:%S").to_string(),
            None => dt.to_string(),
        },
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(_) => String::new(),
    }
}

fn resolve_format(hint: Option<&str>, headers: &StringRecord) -> AppResult<SourceFormat> {
    match hint.and_then(SourceFormat::parse) {
        Some(fmt) => Ok(fmt),
        None => detect_format(headers).ok_or_else(|| {
            AppError::BadRequest(
                "could not detect source format; pass source_format=animo|toggl|clockify|harvest"
                    .into(),
            )
        }),
    }
}

pub async fn commit_import(
    State(state): State<AppState>,
    user: LocalUser,
    Json(req): Json<CommitRequest>,
) -> AppResult<Json<CommitResponse>> {
    let session = {
        let mut sessions = state
            .import_sessions
            .lock()
            .map_err(|_| AppError::Internal(anyhow::anyhow!("import session mutex poisoned")))?;
        prune_expired(&mut sessions);
        sessions
            .remove(&req.session_id)
            .ok_or_else(|| AppError::NotFound)?
    };

    if session.user_id != user.id {
        return Err(AppError::Forbidden);
    }

    let mut tx = state.db.begin().await?;

    // Resolve / create the entities first so we have IDs ready when we
    // start inserting time_entries. All three lookups are case-insensitive
    // to match how we presented the preview.
    let mut client_ids: HashMap<String, String> = fetch_client_id_map(&mut tx, &user.id).await?;
    let mut project_ids: HashMap<String, (String, Option<String>)> =
        fetch_project_id_map(&mut tx, &user.id).await?;
    let mut tag_ids: HashMap<String, String> = fetch_tag_id_map(&mut tx, &user.id).await?;

    let mut clients_created = 0usize;
    let mut projects_created = 0usize;
    let mut tags_created = 0usize;
    let mut entries_created = 0usize;

    for row in &session.valid_rows {
        // Ensure client first so we can link the project to it.
        let client_id = if let Some(name) = row.client_name.as_deref() {
            let key = name.trim().to_lowercase();
            if key.is_empty() {
                None
            } else if let Some(existing) = client_ids.get(&key) {
                Some(existing.clone())
            } else {
                let id = Uuid::new_v4().to_string();
                sqlx::query("INSERT INTO clients (id, user_id, name) VALUES (?, ?, ?)")
                    .bind(&id)
                    .bind(&user.id)
                    .bind(name.trim())
                    .execute(&mut *tx)
                    .await?;
                client_ids.insert(key, id.clone());
                clients_created += 1;
                Some(id)
            }
        } else {
            None
        };

        let project_id = if let Some(name) = row.project_name.as_deref() {
            let key = name.trim().to_lowercase();
            if key.is_empty() {
                None
            } else if let Some((existing_id, _)) = project_ids.get(&key) {
                Some(existing_id.clone())
            } else {
                let id = Uuid::new_v4().to_string();
                let hourly_rate = row.hourly_rate.unwrap_or(0.0).max(0.0);
                let currency = row
                    .currency
                    .clone()
                    .filter(|c| !c.is_empty())
                    .unwrap_or_else(|| "EUR".to_string());
                sqlx::query(
                    "INSERT INTO projects \
                     (id, user_id, client_id, name, hourly_rate, currency) \
                     VALUES (?, ?, ?, ?, ?, ?)",
                )
                .bind(&id)
                .bind(&user.id)
                .bind(client_id.as_deref())
                .bind(name.trim())
                .bind(hourly_rate)
                .bind(&currency)
                .execute(&mut *tx)
                .await?;
                project_ids.insert(key, (id.clone(), client_id));
                projects_created += 1;
                Some(id)
            }
        } else {
            None
        };

        let mut row_tag_ids: Vec<String> = Vec::with_capacity(row.tags.len());
        for tag in &row.tags {
            let trimmed = tag.trim();
            if trimmed.is_empty() {
                continue;
            }
            let key = trimmed.to_lowercase();
            if let Some(existing) = tag_ids.get(&key) {
                row_tag_ids.push(existing.clone());
                continue;
            }
            let id = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)")
                .bind(&id)
                .bind(&user.id)
                .bind(trimmed)
                .execute(&mut *tx)
                .await?;
            tag_ids.insert(key, id.clone());
            tags_created += 1;
            row_tag_ids.push(id);
        }

        let Some((start_iso, end_iso, duration)) = row_to_iso_range(row) else {
            // Should never happen — preview already filtered these — but
            // we re-check defensively rather than panicking.
            continue;
        };

        let entry_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO time_entries \
             (id, user_id, project_id, description, start_time, end_time, \
              duration_seconds, billable) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&entry_id)
        .bind(&user.id)
        .bind(project_id.as_deref())
        .bind(&row.description)
        .bind(&start_iso)
        .bind(&end_iso)
        .bind(duration)
        .bind(row.billable as i64)
        .execute(&mut *tx)
        .await?;

        for tag_id in &row_tag_ids {
            sqlx::query("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)")
                .bind(&entry_id)
                .bind(tag_id)
                .execute(&mut *tx)
                .await?;
        }
        entries_created += 1;
    }

    tx.commit().await?;

    Ok(Json(CommitResponse {
        entries_created,
        clients_created,
        projects_created,
        tags_created,
        duplicates_skipped: session.duplicate_rows.len(),
    }))
}

// ---------------- DB helpers ----------------

async fn fetch_client_names(state: &AppState, user_id: &str) -> AppResult<HashSet<String>> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT name FROM clients WHERE user_id = ?")
        .bind(user_id)
        .fetch_all(&state.db)
        .await?;
    Ok(rows.into_iter().map(|(n,)| n.to_lowercase()).collect())
}

async fn fetch_project_names(state: &AppState, user_id: &str) -> AppResult<HashSet<String>> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT name FROM projects WHERE user_id = ?")
        .bind(user_id)
        .fetch_all(&state.db)
        .await?;
    Ok(rows.into_iter().map(|(n,)| n.to_lowercase()).collect())
}

async fn fetch_tag_names(state: &AppState, user_id: &str) -> AppResult<HashSet<String>> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT name FROM tags WHERE user_id = ?")
        .bind(user_id)
        .fetch_all(&state.db)
        .await?;
    Ok(rows.into_iter().map(|(n,)| n.to_lowercase()).collect())
}

async fn fetch_client_id_map(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user_id: &str,
) -> AppResult<HashMap<String, String>> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT id, name FROM clients WHERE user_id = ?")
            .bind(user_id)
            .fetch_all(&mut **tx)
            .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name)| (name.to_lowercase(), id))
        .collect())
}

async fn fetch_project_id_map(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user_id: &str,
) -> AppResult<HashMap<String, (String, Option<String>)>> {
    let rows: Vec<(String, String, Option<String>)> =
        sqlx::query_as("SELECT id, name, client_id FROM projects WHERE user_id = ?")
            .bind(user_id)
            .fetch_all(&mut **tx)
            .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, cid)| (name.to_lowercase(), (id, cid)))
        .collect())
}

async fn fetch_tag_id_map(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user_id: &str,
) -> AppResult<HashMap<String, String>> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM tags WHERE user_id = ?")
        .bind(user_id)
        .fetch_all(&mut **tx)
        .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name)| (name.to_lowercase(), id))
        .collect())
}

async fn is_duplicate(
    state: &AppState,
    user_id: &str,
    start_iso: &str,
    end_iso: &str,
    description: &str,
) -> AppResult<bool> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM time_entries \
         WHERE user_id = ? AND start_time = ? AND end_time = ? AND description = ? \
         LIMIT 1",
    )
    .bind(user_id)
    .bind(start_iso)
    .bind(end_iso)
    .bind(description)
    .fetch_optional(&state.db)
    .await?;
    Ok(row.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(cols: &[&str]) -> StringRecord {
        let mut r = StringRecord::new();
        for c in cols {
            r.push_field(c);
        }
        r
    }

    fn row(values: &[&str]) -> StringRecord {
        let mut r = StringRecord::new();
        for v in values {
            r.push_field(v);
        }
        r
    }

    // ---- utility parsers ----

    #[test]
    fn parses_iso_date() {
        assert_eq!(
            parse_date("2026-05-25").unwrap(),
            NaiveDate::from_ymd_opt(2026, 5, 25).unwrap()
        );
    }

    #[test]
    fn parses_us_date() {
        assert_eq!(
            parse_date("05/25/2026").unwrap(),
            NaiveDate::from_ymd_opt(2026, 5, 25).unwrap()
        );
    }

    #[test]
    fn parses_eu_date() {
        assert_eq!(
            parse_date("25.05.2026").unwrap(),
            NaiveDate::from_ymd_opt(2026, 5, 25).unwrap()
        );
    }

    #[test]
    fn parses_iso_datetime_prefix() {
        assert_eq!(
            parse_date("2026-05-25T09:30:00Z").unwrap(),
            NaiveDate::from_ymd_opt(2026, 5, 25).unwrap()
        );
    }

    #[test]
    fn rejects_garbage_date() {
        assert!(parse_date("not-a-date").is_err());
    }

    #[test]
    fn parses_24h_time() {
        assert_eq!(
            parse_time("09:30:00").unwrap(),
            NaiveTime::from_hms_opt(9, 30, 0).unwrap()
        );
    }

    #[test]
    fn parses_12h_time() {
        assert_eq!(
            parse_time("09:30:00 AM").unwrap(),
            NaiveTime::from_hms_opt(9, 30, 0).unwrap()
        );
        assert_eq!(
            parse_time("01:30 PM").unwrap(),
            NaiveTime::from_hms_opt(13, 30, 0).unwrap()
        );
    }

    #[test]
    fn duration_supports_hhmmss() {
        assert_eq!(parse_duration_seconds("01:30:00").unwrap(), 5400);
        assert_eq!(parse_duration_seconds("00:15").unwrap(), 900);
    }

    #[test]
    fn duration_supports_decimal_hours() {
        assert_eq!(parse_duration_seconds("1.5").unwrap(), 5400);
    }

    #[test]
    fn duration_supports_integer_seconds() {
        assert_eq!(parse_duration_seconds("5400").unwrap(), 5400);
    }

    #[test]
    fn duration_rejects_garbage() {
        assert!(parse_duration_seconds("abc").is_err());
    }

    #[test]
    fn bool_flag_variants() {
        assert!(parse_bool_flag("true"));
        assert!(parse_bool_flag("Yes"));
        assert!(parse_bool_flag("1"));
        assert!(!parse_bool_flag("no"));
        assert!(!parse_bool_flag(""));
    }

    #[test]
    fn tag_list_trims_and_drops_blanks() {
        assert_eq!(
            parse_tag_list("a, b , ,c"),
            vec!["a".to_string(), "b".to_string(), "c".to_string()]
        );
    }

    #[test]
    fn f64_lenient_strips_symbols() {
        assert_eq!(parse_f64_lenient("$1,234.56 USD"), Some(1234.56));
        assert_eq!(parse_f64_lenient("60.00"), Some(60.0));
        assert_eq!(parse_f64_lenient(""), None);
        assert_eq!(parse_f64_lenient("abc"), None);
    }

    // ---- format detection ----

    #[test]
    fn detects_animo_format() {
        let h = headers(&[
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
        ]);
        assert_eq!(detect_format(&h), Some(SourceFormat::Animo));
    }

    #[test]
    fn detects_toggl_format() {
        let h = headers(&[
            "User",
            "Email",
            "Client",
            "Project",
            "Task",
            "Description",
            "Billable",
            "Start date",
            "Start time",
            "End date",
            "End time",
            "Duration",
            "Tags",
            "Amount ()",
        ]);
        assert_eq!(detect_format(&h), Some(SourceFormat::Toggl));
    }

    #[test]
    fn detects_clockify_format() {
        let h = headers(&[
            "Project",
            "Client",
            "Description",
            "Task",
            "User",
            "Email",
            "Tags",
            "Billable",
            "Start Date",
            "Start Time",
            "End Date",
            "End Time",
            "Duration (h)",
            "Billable Rate (USD)",
            "Billable Amount (USD)",
        ]);
        assert_eq!(detect_format(&h), Some(SourceFormat::Clockify));
    }

    #[test]
    fn detects_harvest_format() {
        let h = headers(&[
            "Date",
            "Client",
            "Project",
            "Task",
            "Notes",
            "Hours",
            "Billable?",
            "Invoiced?",
            "First Name",
            "Last Name",
            "Billable Rate",
            "Currency",
        ]);
        assert_eq!(detect_format(&h), Some(SourceFormat::Harvest));
    }

    #[test]
    fn detect_unknown_format() {
        let h = headers(&["foo", "bar", "baz"]);
        assert_eq!(detect_format(&h), None);
    }

    // ---- parser round-trips ----

    #[test]
    fn animo_parser_round_trip() {
        let h = headers(&[
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
        ]);
        let r = row(&[
            "e-1",
            "2026-05-25",
            "09:30:00",
            "11:00:00",
            "5400",
            "1h 30m",
            "Worked on tray",
            "Animo",
            "NSoftware",
            "deep work, planning",
            "true",
            "60.00",
            "EUR",
            "90.00",
        ]);
        let parser = parser_for(SourceFormat::Animo, &h);
        let out = parser.parse_row(&r).unwrap();
        assert_eq!(out.source_id.as_deref(), Some("e-1"));
        assert_eq!(out.date, NaiveDate::from_ymd_opt(2026, 5, 25).unwrap());
        assert_eq!(
            out.start_time,
            Some(NaiveTime::from_hms_opt(9, 30, 0).unwrap())
        );
        assert_eq!(
            out.end_time,
            Some(NaiveTime::from_hms_opt(11, 0, 0).unwrap())
        );
        assert_eq!(out.duration_seconds, Some(5400));
        assert_eq!(out.description, "Worked on tray");
        assert_eq!(out.project_name.as_deref(), Some("Animo"));
        assert_eq!(out.client_name.as_deref(), Some("NSoftware"));
        assert_eq!(
            out.tags,
            vec!["deep work".to_string(), "planning".to_string()]
        );
        assert!(out.billable);
        assert_eq!(out.hourly_rate, Some(60.0));
        assert_eq!(out.currency.as_deref(), Some("EUR"));
        validate(&out).unwrap();
    }

    #[test]
    fn toggl_parser_basic() {
        let h = headers(&[
            "User",
            "Email",
            "Client",
            "Project",
            "Task",
            "Description",
            "Billable",
            "Start date",
            "Start time",
            "End date",
            "End time",
            "Duration",
            "Tags",
            "Amount ()",
        ]);
        let r = row(&[
            "Tamas",
            "tamas@example.com",
            "NSoftware",
            "Animo",
            "",
            "Imported entry",
            "Yes",
            "2026-05-25",
            "09:30:00",
            "2026-05-25",
            "11:00:00",
            "01:30:00",
            "alpha, beta",
            "0.00",
        ]);
        let parser = TogglParser::new(&h);
        let out = parser.parse_row(&r).unwrap();
        assert_eq!(out.date, NaiveDate::from_ymd_opt(2026, 5, 25).unwrap());
        assert_eq!(
            out.start_time,
            Some(NaiveTime::from_hms_opt(9, 30, 0).unwrap())
        );
        assert_eq!(
            out.end_time,
            Some(NaiveTime::from_hms_opt(11, 0, 0).unwrap())
        );
        assert_eq!(out.duration_seconds, Some(5400));
        assert!(out.billable);
        assert_eq!(out.project_name.as_deref(), Some("Animo"));
        assert_eq!(out.client_name.as_deref(), Some("NSoftware"));
        assert_eq!(out.tags, vec!["alpha".to_string(), "beta".to_string()]);
        assert!(out.hourly_rate.is_none());
        validate(&out).unwrap();
    }

    #[test]
    fn clockify_parser_extracts_currency_and_rate() {
        let h = headers(&[
            "Project",
            "Client",
            "Description",
            "Task",
            "User",
            "Email",
            "Tags",
            "Billable",
            "Start Date",
            "Start Time",
            "End Date",
            "End Time",
            "Duration (h)",
            "Billable Rate (USD)",
            "Billable Amount (USD)",
        ]);
        let r = row(&[
            "Animo",
            "NSoftware",
            "Clockify entry",
            "",
            "Tamas",
            "tamas@example.com",
            "alpha",
            "true",
            "05/25/2026",
            "09:30:00",
            "05/25/2026",
            "11:00:00",
            "01:30:00",
            "60.00",
            "90.00",
        ]);
        let parser = ClockifyParser::new(&h);
        let out = parser.parse_row(&r).unwrap();
        assert_eq!(out.date, NaiveDate::from_ymd_opt(2026, 5, 25).unwrap());
        assert_eq!(out.duration_seconds, Some(5400));
        assert_eq!(out.hourly_rate, Some(60.0));
        assert_eq!(out.currency.as_deref(), Some("USD"));
        assert!(out.billable);
        validate(&out).unwrap();
    }

    #[test]
    fn harvest_parser_uses_decimal_hours() {
        let h = headers(&[
            "Date",
            "Client",
            "Project",
            "Task",
            "Notes",
            "Hours",
            "Billable?",
            "Invoiced?",
            "First Name",
            "Last Name",
            "Billable Rate",
            "Currency",
        ]);
        let r = row(&[
            "2026-05-25",
            "NSoftware",
            "Animo",
            "Dev",
            "Harvest entry",
            "1.5",
            "Yes",
            "No",
            "Tamas",
            "Kapitany",
            "75.00",
            "eur",
        ]);
        let parser = HarvestParser::new(&h);
        let out = parser.parse_row(&r).unwrap();
        assert_eq!(out.date, NaiveDate::from_ymd_opt(2026, 5, 25).unwrap());
        assert_eq!(out.duration_seconds, Some(5400));
        assert_eq!(out.start_time, None);
        assert_eq!(out.end_time, None);
        assert!(out.billable);
        assert_eq!(out.hourly_rate, Some(75.0));
        assert_eq!(out.currency.as_deref(), Some("EUR"));
        assert_eq!(out.description, "Harvest entry");
        validate(&out).unwrap();
    }

    // ---- validation ----

    #[test]
    fn validate_accepts_duration_only() {
        let r = ImportRow {
            source_id: None,
            date: NaiveDate::from_ymd_opt(2026, 5, 25).unwrap(),
            start_time: None,
            end_time: None,
            duration_seconds: Some(60),
            description: String::new(),
            project_name: None,
            client_name: None,
            tags: vec![],
            billable: false,
            hourly_rate: None,
            currency: None,
        };
        validate(&r).unwrap();
    }

    #[test]
    fn validate_accepts_start_end_pair() {
        let r = ImportRow {
            source_id: None,
            date: NaiveDate::from_ymd_opt(2026, 5, 25).unwrap(),
            start_time: Some(NaiveTime::from_hms_opt(9, 0, 0).unwrap()),
            end_time: Some(NaiveTime::from_hms_opt(10, 0, 0).unwrap()),
            duration_seconds: None,
            description: String::new(),
            project_name: None,
            client_name: None,
            tags: vec![],
            billable: false,
            hourly_rate: None,
            currency: None,
        };
        validate(&r).unwrap();
    }

    #[test]
    fn validate_rejects_missing_duration_and_times() {
        let r = ImportRow {
            source_id: None,
            date: NaiveDate::from_ymd_opt(2026, 5, 25).unwrap(),
            start_time: None,
            end_time: None,
            duration_seconds: None,
            description: String::new(),
            project_name: None,
            client_name: None,
            tags: vec![],
            billable: false,
            hourly_rate: None,
            currency: None,
        };
        let err = validate(&r).unwrap_err();
        assert!(matches!(err, ImportError::MissingField(_)));
    }

    #[test]
    fn validate_rejects_negative_duration() {
        let r = ImportRow {
            source_id: None,
            date: NaiveDate::from_ymd_opt(2026, 5, 25).unwrap(),
            start_time: None,
            end_time: None,
            duration_seconds: Some(-1),
            description: String::new(),
            project_name: None,
            client_name: None,
            tags: vec![],
            billable: false,
            hourly_rate: None,
            currency: None,
        };
        let err = validate(&r).unwrap_err();
        assert!(matches!(err, ImportError::InvalidValue { .. }));
    }

    #[test]
    fn missing_required_date_returns_error() {
        let h = headers(&["entry_id", "duration_seconds", "description"]);
        let r = row(&["e-1", "60", "no date"]);
        let parser = AnimoParser::new(&h);
        let err = parser.parse_row(&r).unwrap_err();
        assert_eq!(err, ImportError::MissingField("date".into()));
    }
}
