//! Shared CSV/XLSX import parser infrastructure.
//!
//! The HTTP endpoints (tasks 14, 15) read uploaded files, hand a header row +
//! data rows to [`detect_format`] / [`parser_for`], and then call
//! [`ImportParser::parse_row`] per row followed by [`validate`].

use std::collections::HashMap;

use chrono::{NaiveDate, NaiveTime};
use csv::StringRecord;
use thiserror::Error;

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

pub trait ImportParser {
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
    if index.has("user")
        && index.has("email")
        && index.has("start date")
        && index.has("duration")
    {
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
            description: self
                .headers
                .get(record, "notes")
                .unwrap_or("")
                .to_string(),
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
            currency: self.headers.get(record, "currency").map(|s| s.to_uppercase()),
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
        assert_eq!(out.start_time, Some(NaiveTime::from_hms_opt(9, 30, 0).unwrap()));
        assert_eq!(out.end_time, Some(NaiveTime::from_hms_opt(11, 0, 0).unwrap()));
        assert_eq!(out.duration_seconds, Some(5400));
        assert_eq!(out.description, "Worked on tray");
        assert_eq!(out.project_name.as_deref(), Some("Animo"));
        assert_eq!(out.client_name.as_deref(), Some("NSoftware"));
        assert_eq!(out.tags, vec!["deep work".to_string(), "planning".to_string()]);
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
        assert_eq!(out.start_time, Some(NaiveTime::from_hms_opt(9, 30, 0).unwrap()));
        assert_eq!(out.end_time, Some(NaiveTime::from_hms_opt(11, 0, 0).unwrap()));
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
