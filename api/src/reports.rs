use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::users::LocalUser;
use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct RangeQuery {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EntryRowRaw {
    pub id: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub client_name: Option<String>,
    pub description: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_seconds: i64,
    pub billable: bool,
    pub hourly_rate: Option<f64>,
    pub currency: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryRow {
    pub id: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub client_name: Option<String>,
    pub description: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_seconds: i64,
    pub billable: bool,
    pub hourly_rate: Option<f64>,
    pub currency: Option<String>,
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DayTotal {
    pub date: String,
    pub seconds: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AmountByCurrency {
    pub currency: String,
    pub amount: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub total_seconds: i64,
    pub billable_seconds: i64,
    pub daily: Vec<DayTotal>,
    pub entries: Vec<EntryRow>,
    pub amounts: Vec<AmountByCurrency>,
}

async fn fetch_entries(
    state: &AppState,
    user_id: &str,
    from: &str,
    to: &str,
) -> AppResult<Vec<EntryRow>> {
    let from_iso = format!("{from}T00:00:00.000Z");
    let to_iso = format!("{to}T23:59:59.999Z");
    let rows: Vec<EntryRowRaw> = sqlx::query_as(
        "SELECT te.id, te.project_id, p.name as project_name, c.name as client_name, \
         te.description, te.start_time, te.end_time, te.duration_seconds, te.billable, \
         p.hourly_rate as hourly_rate, p.currency as currency \
         FROM time_entries te \
         LEFT JOIN projects p ON p.id = te.project_id \
         LEFT JOIN clients c ON c.id = p.client_id \
         WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time <= ? \
         ORDER BY te.start_time ASC",
    )
    .bind(user_id)
    .bind(&from_iso)
    .bind(&to_iso)
    .fetch_all(&state.db)
    .await?;

    let mut tag_map: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    if !rows.is_empty() {
        let placeholders = rows.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT entry_id, tag_id FROM entry_tags WHERE entry_id IN ({placeholders}) ORDER BY tag_id"
        );
        let mut q = sqlx::query_as::<_, (String, String)>(&sql);
        for r in &rows {
            q = q.bind(&r.id);
        }
        let pairs: Vec<(String, String)> = q.fetch_all(&state.db).await?;
        for (entry_id, tag_id) in pairs {
            tag_map.entry(entry_id).or_default().push(tag_id);
        }
    }

    let entries: Vec<EntryRow> = rows
        .into_iter()
        .map(|r| {
            let tag_ids = tag_map.get(&r.id).cloned().unwrap_or_default();
            EntryRow {
                id: r.id,
                project_id: r.project_id,
                project_name: r.project_name,
                client_name: r.client_name,
                description: r.description,
                start_time: r.start_time,
                end_time: r.end_time,
                duration_seconds: r.duration_seconds,
                billable: r.billable,
                hourly_rate: r.hourly_rate,
                currency: r.currency,
                tag_ids,
            }
        })
        .collect();
    Ok(entries)
}

fn group_daily(entries: &[EntryRow], from: &str, to: &str) -> AppResult<Vec<DayTotal>> {
    let from_d = NaiveDate::parse_from_str(from, "%Y-%m-%d")
        .map_err(|e| AppError::BadRequest(format!("invalid from date: {e}")))?;
    let to_d = NaiveDate::parse_from_str(to, "%Y-%m-%d")
        .map_err(|e| AppError::BadRequest(format!("invalid to date: {e}")))?;
    let mut out = Vec::new();
    let mut d = from_d;
    while d <= to_d {
        let key = d.format("%Y-%m-%d").to_string();
        let secs: i64 = entries
            .iter()
            .filter(|e| e.start_time.starts_with(&key))
            .map(|e| e.duration_seconds)
            .sum();
        out.push(DayTotal {
            date: key,
            seconds: secs,
        });
        d = d.succ_opt().unwrap();
    }
    Ok(out)
}

pub async fn summary(
    State(state): State<AppState>,
    user: LocalUser,
    Query(q): Query<RangeQuery>,
) -> AppResult<Json<Summary>> {
    let entries = fetch_entries(&state, &user.id, &q.from, &q.to).await?;
    let total_seconds = entries.iter().map(|e| e.duration_seconds).sum();
    let billable_seconds = entries
        .iter()
        .filter(|e| e.billable)
        .map(|e| e.duration_seconds)
        .sum();
    let daily = group_daily(&entries, &q.from, &q.to)?;

    let mut amount_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for e in entries.iter().filter(|e| e.billable) {
        let rate = e.hourly_rate.unwrap_or(0.0);
        if rate <= 0.0 {
            continue;
        }
        let cur = e.currency.clone().unwrap_or_else(|| "EUR".to_string());
        let amount = (e.duration_seconds as f64 / 3600.0) * rate;
        *amount_map.entry(cur).or_insert(0.0) += amount;
    }
    let mut amounts: Vec<AmountByCurrency> = amount_map
        .into_iter()
        .map(|(currency, amount)| AmountByCurrency {
            currency,
            amount: (amount * 100.0).round() / 100.0,
        })
        .collect();
    amounts.sort_by(|a, b| a.currency.cmp(&b.currency));

    Ok(Json(Summary {
        total_seconds,
        billable_seconds,
        daily,
        entries,
        amounts,
    }))
}

async fn fetch_tag_name_map(
    state: &AppState,
    user_id: &str,
) -> AppResult<std::collections::HashMap<String, String>> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM tags WHERE user_id = ?")
        .bind(user_id)
        .fetch_all(&state.db)
        .await?;
    Ok(rows.into_iter().collect())
}

fn compute_amount(billable: bool, hourly_rate: Option<f64>, duration_seconds: i64) -> Option<f64> {
    match (billable, hourly_rate) {
        (true, Some(rate)) if rate > 0.0 => {
            let raw = (duration_seconds as f64 / 3600.0) * rate;
            Some((raw * 100.0).round() / 100.0)
        }
        _ => None,
    }
}

pub async fn export_csv(
    State(state): State<AppState>,
    user: LocalUser,
    Query(q): Query<RangeQuery>,
) -> AppResult<Response> {
    NaiveDate::parse_from_str(&q.from, "%Y-%m-%d")
        .map_err(|e| AppError::BadRequest(format!("invalid from date: {e}")))?;
    NaiveDate::parse_from_str(&q.to, "%Y-%m-%d")
        .map_err(|e| AppError::BadRequest(format!("invalid to date: {e}")))?;

    let entries = fetch_entries(&state, &user.id, &q.from, &q.to).await?;
    let tag_names = fetch_tag_name_map(&state, &user.id).await?;

    let mut wtr = csv::Writer::from_writer(Vec::<u8>::new());
    wtr.write_record([
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
    ])
    .map_err(|e| AppError::Internal(anyhow::anyhow!("csv header: {e}")))?;

    for e in &entries {
        let date = e.start_time.get(..10).unwrap_or("").to_string();
        let start_t = e.start_time.get(11..19).unwrap_or("").to_string();
        let end_t = e.end_time.get(11..19).unwrap_or("").to_string();
        let duration_fmt = fmt_duration(e.duration_seconds);
        let tag_csv = e
            .tag_ids
            .iter()
            .filter_map(|id| tag_names.get(id).cloned())
            .collect::<Vec<_>>()
            .join(", ");
        let billable_str = if e.billable { "true" } else { "false" };
        let hourly_str = e.hourly_rate.map(|v| format!("{v:.2}")).unwrap_or_default();
        let currency_str = e.currency.clone().unwrap_or_default();
        let amount_str = compute_amount(e.billable, e.hourly_rate, e.duration_seconds)
            .map(|v| format!("{v:.2}"))
            .unwrap_or_default();

        wtr.write_record([
            e.id.as_str(),
            &date,
            &start_t,
            &end_t,
            &e.duration_seconds.to_string(),
            &duration_fmt,
            &e.description,
            e.project_name.as_deref().unwrap_or(""),
            e.client_name.as_deref().unwrap_or(""),
            &tag_csv,
            billable_str,
            &hourly_str,
            &currency_str,
            &amount_str,
        ])
        .map_err(|err| AppError::Internal(anyhow::anyhow!("csv row {}: {err}", e.id)))?;
    }

    let data = wtr
        .into_inner()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("csv flush: {e}")))?;

    let filename = format!("animo_export_{}_{}.csv", q.from, q.to);
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        data,
    )
        .into_response())
}

pub async fn export_xlsx(
    State(state): State<AppState>,
    user: LocalUser,
    Query(q): Query<RangeQuery>,
) -> AppResult<Response> {
    use rust_xlsxwriter::{Format, FormatBorder, Workbook};

    NaiveDate::parse_from_str(&q.from, "%Y-%m-%d")
        .map_err(|e| AppError::BadRequest(format!("invalid from date: {e}")))?;
    NaiveDate::parse_from_str(&q.to, "%Y-%m-%d")
        .map_err(|e| AppError::BadRequest(format!("invalid to date: {e}")))?;

    let entries = fetch_entries(&state, &user.id, &q.from, &q.to).await?;
    let tag_names = fetch_tag_name_map(&state, &user.id).await?;

    let mut workbook = Workbook::new();

    // ── Entries sheet ────────────────────────────────────────────────
    // Columns mirror the CSV export so a workbook round-trips through
    // the import pipeline (task 15) without any column-name fix-up.
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

    let header_format = Format::new()
        .set_bold()
        .set_border_bottom(FormatBorder::Thin);
    let number_2dp = Format::new().set_num_format("0.00");
    let entries_sheet = workbook
        .add_worksheet()
        .set_name("Entries")
        .map_err(|e| AppError::Internal(anyhow::anyhow!("xlsx sheet name: {e}")))?;

    for (col, header) in HEADERS.iter().enumerate() {
        entries_sheet
            .write_string_with_format(0, col as u16, *header, &header_format)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("xlsx header {col}: {e}")))?;
    }

    for (i, e) in entries.iter().enumerate() {
        let r = (i + 1) as u32;
        let date = e.start_time.get(..10).unwrap_or("").to_string();
        let start_t = e.start_time.get(11..19).unwrap_or("").to_string();
        let end_t = e.end_time.get(11..19).unwrap_or("").to_string();
        let duration_fmt = fmt_duration(e.duration_seconds);
        let tag_csv = e
            .tag_ids
            .iter()
            .filter_map(|id| tag_names.get(id).cloned())
            .collect::<Vec<_>>()
            .join(", ");
        let amount = compute_amount(e.billable, e.hourly_rate, e.duration_seconds);

        // Strings first, then numbers with formats. Errors here are
        // internal — the data already passed validation upstream.
        let write_str = |sheet: &mut rust_xlsxwriter::Worksheet, col: u16, value: &str| {
            sheet
                .write_string(r, col, value)
                .map(|_| ())
                .map_err(|err| AppError::Internal(anyhow::anyhow!("xlsx row {r} col {col}: {err}")))
        };

        write_str(entries_sheet, 0, &e.id)?;
        write_str(entries_sheet, 1, &date)?;
        write_str(entries_sheet, 2, &start_t)?;
        write_str(entries_sheet, 3, &end_t)?;
        entries_sheet
            .write_number(r, 4, e.duration_seconds as f64)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("xlsx duration {r}: {err}")))?;
        write_str(entries_sheet, 5, &duration_fmt)?;
        write_str(entries_sheet, 6, &e.description)?;
        write_str(entries_sheet, 7, e.project_name.as_deref().unwrap_or(""))?;
        write_str(entries_sheet, 8, e.client_name.as_deref().unwrap_or(""))?;
        write_str(entries_sheet, 9, &tag_csv)?;
        entries_sheet
            .write_boolean(r, 10, e.billable)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("xlsx billable {r}: {err}")))?;
        if let Some(rate) = e.hourly_rate {
            entries_sheet
                .write_number_with_format(r, 11, rate, &number_2dp)
                .map_err(|err| AppError::Internal(anyhow::anyhow!("xlsx rate {r}: {err}")))?;
        }
        write_str(entries_sheet, 12, e.currency.as_deref().unwrap_or(""))?;
        if let Some(a) = amount {
            entries_sheet
                .write_number_with_format(r, 13, a, &number_2dp)
                .map_err(|err| AppError::Internal(anyhow::anyhow!("xlsx amount {r}: {err}")))?;
        }
    }

    // ── Summary sheet ────────────────────────────────────────────────
    // Pivot-style totals: per project, then per currency. Lightweight
    // enough that accountants can paste it straight into an invoice
    // tracker without re-aggregating.
    let summary_sheet = workbook
        .add_worksheet()
        .set_name("Summary")
        .map_err(|e| AppError::Internal(anyhow::anyhow!("xlsx summary sheet: {e}")))?;

    let total_seconds: i64 = entries.iter().map(|e| e.duration_seconds).sum();
    let billable_seconds: i64 = entries
        .iter()
        .filter(|e| e.billable)
        .map(|e| e.duration_seconds)
        .sum();

    summary_sheet
        .write_string_with_format(0, 0, "Range", &header_format)
        .ok();
    summary_sheet
        .write_string(0, 1, &format!("{} → {}", q.from, q.to))
        .ok();
    summary_sheet
        .write_string_with_format(1, 0, "Total hours", &header_format)
        .ok();
    summary_sheet
        .write_string(1, 1, &fmt_duration(total_seconds))
        .ok();
    summary_sheet
        .write_string_with_format(2, 0, "Billable hours", &header_format)
        .ok();
    summary_sheet
        .write_string(2, 1, &fmt_duration(billable_seconds))
        .ok();

    // Per-project rollup.
    let mut project_totals: std::collections::BTreeMap<String, i64> =
        std::collections::BTreeMap::new();
    for e in &entries {
        let key = e
            .project_name
            .clone()
            .unwrap_or_else(|| "(no project)".to_string());
        *project_totals.entry(key).or_insert(0) += e.duration_seconds;
    }
    summary_sheet
        .write_string_with_format(4, 0, "Project", &header_format)
        .ok();
    summary_sheet
        .write_string_with_format(4, 1, "Hours", &header_format)
        .ok();
    for (i, (name, seconds)) in project_totals.iter().enumerate() {
        let r = (5 + i) as u32;
        summary_sheet.write_string(r, 0, name).ok();
        summary_sheet
            .write_string(r, 1, &fmt_duration(*seconds))
            .ok();
    }

    // Per-currency rollup (billable only — non-billable has no amount).
    let mut currency_totals: std::collections::BTreeMap<String, f64> =
        std::collections::BTreeMap::new();
    for e in entries.iter().filter(|e| e.billable) {
        if let Some(amount) = compute_amount(e.billable, e.hourly_rate, e.duration_seconds) {
            let cur = e.currency.clone().unwrap_or_else(|| "EUR".to_string());
            *currency_totals.entry(cur).or_insert(0.0) += amount;
        }
    }
    if !currency_totals.is_empty() {
        let row = (5 + project_totals.len() + 1) as u32;
        summary_sheet
            .write_string_with_format(row, 0, "Currency", &header_format)
            .ok();
        summary_sheet
            .write_string_with_format(row, 1, "Amount", &header_format)
            .ok();
        for (i, (cur, amount)) in currency_totals.iter().enumerate() {
            let r = row + 1 + i as u32;
            summary_sheet.write_string(r, 0, cur).ok();
            summary_sheet
                .write_number_with_format(r, 1, *amount, &number_2dp)
                .ok();
        }
    }

    let bytes = workbook
        .save_to_buffer()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("xlsx save: {e}")))?;

    let filename = format!("animo_export_{}_{}.xlsx", q.from, q.to);
    Ok((
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string(),
            ),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        bytes,
    )
        .into_response())
}

pub async fn export_pdf(
    State(state): State<AppState>,
    user: LocalUser,
    Query(q): Query<RangeQuery>,
) -> AppResult<Response> {
    let entries = fetch_entries(&state, &user.id, &q.from, &q.to).await?;
    let total_seconds: i64 = entries.iter().map(|e| e.duration_seconds).sum();

    let user_row: (String,) = sqlx::query_as("SELECT name FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_one(&state.db)
        .await?;
    let user_name = user_row.0;

    let pdf = render_pdf(&user_name, &q.from, &q.to, total_seconds, &entries)
        .map_err(AppError::Internal)?;

    let filename = format!("report_{}_{}.pdf", q.from, q.to);
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/pdf".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        pdf,
    )
        .into_response())
}

fn fmt_duration(seconds: i64) -> String {
    let h = seconds / 3600;
    let m = (seconds % 3600) / 60;
    format!("{h}h {m:02}m")
}

fn fmt_date_only(iso: &str) -> String {
    iso.get(..10).unwrap_or(iso).to_string()
}

fn fmt_time_range(start: &str, end: &str) -> String {
    let s = start.get(11..16).unwrap_or("");
    let e = end.get(11..16).unwrap_or("");
    format!("{s}–{e}")
}

fn render_pdf(
    user_name: &str,
    from: &str,
    to: &str,
    total_seconds: i64,
    entries: &[EntryRow],
) -> anyhow::Result<Vec<u8>> {
    let font_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/fonts");
    let font = genpdf::fonts::from_files(font_dir, "DejaVuSans", None)?;
    let mut doc = genpdf::Document::new(font);
    doc.set_title("Detailed Report");
    doc.set_paper_size(genpdf::PaperSize::A4);
    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(15);
    doc.set_page_decorator(decorator);

    use genpdf::elements::{Break, Paragraph, TableLayout};
    use genpdf::style::{Style, StyledString};
    use genpdf::Element;

    let title_style = Style::new().bold().with_font_size(20);
    let label_style = Style::new().with_color(genpdf::style::Color::Rgb(100, 116, 139));
    let big_style = Style::new().bold().with_font_size(28);
    let small = Style::new().with_font_size(9);

    doc.push(Paragraph::new(StyledString::new(
        "Detailed Report",
        title_style,
    )));
    doc.push(Paragraph::new(format!("Range: {from} → {to}")));
    doc.push(Paragraph::new(format!("User: {user_name}")));
    doc.push(Break::new(0.5));

    doc.push(Paragraph::new(StyledString::new(
        "TOTAL HOURS",
        label_style,
    )));
    doc.push(Paragraph::new(StyledString::new(
        fmt_duration(total_seconds),
        big_style,
    )));
    doc.push(Break::new(1.0));

    let mut table = TableLayout::new(vec![3, 5, 3, 2, 2]);
    table.set_cell_decorator(genpdf::elements::FrameCellDecorator::new(true, true, false));

    let head_style = Style::new().bold();
    let mut row = table.row();
    row.push_element(Paragraph::new(StyledString::new("DATE", head_style)).padded(2));
    row.push_element(Paragraph::new(StyledString::new("DESCRIPTION", head_style)).padded(2));
    row.push_element(Paragraph::new(StyledString::new("PROJECT / CLIENT", head_style)).padded(2));
    row.push_element(Paragraph::new(StyledString::new("TIME", head_style)).padded(2));
    row.push_element(Paragraph::new(StyledString::new("DURATION", head_style)).padded(2));
    row.push().map_err(|e| anyhow::anyhow!("pdf row: {e}"))?;

    for e in entries {
        let mut row = table.row();
        row.push_element(
            Paragraph::new(StyledString::new(fmt_date_only(&e.start_time), small)).padded(2),
        );
        row.push_element(
            Paragraph::new(StyledString::new(
                if e.description.is_empty() {
                    "(no description)".to_string()
                } else {
                    e.description.clone()
                },
                small,
            ))
            .padded(2),
        );
        let proj = match (&e.project_name, &e.client_name) {
            (Some(p), Some(c)) => format!("{p} / {c}"),
            (Some(p), None) => p.clone(),
            _ => "—".to_string(),
        };
        row.push_element(Paragraph::new(StyledString::new(proj, small)).padded(2));
        row.push_element(
            Paragraph::new(StyledString::new(
                fmt_time_range(&e.start_time, &e.end_time),
                small,
            ))
            .padded(2),
        );
        row.push_element(
            Paragraph::new(StyledString::new(fmt_duration(e.duration_seconds), small)).padded(2),
        );
        row.push().map_err(|e| anyhow::anyhow!("pdf row: {e}"))?;
    }

    doc.push(table);

    let mut buf = Vec::new();
    doc.render(&mut buf)?;
    Ok(buf)
}

// ensure Utc/DateTime are still considered used by linker
#[allow(dead_code)]
fn _utc_marker() -> DateTime<Utc> {
    Utc::now()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_amount_billable_with_rate() {
        // 1h30m at 60.00/hr → 90.00
        let amount = compute_amount(true, Some(60.0), 5400);
        assert_eq!(amount, Some(90.0));
    }

    #[test]
    fn compute_amount_rounds_to_two_decimals() {
        // 1h at 33.333/hr → 33.33
        let amount = compute_amount(true, Some(33.333), 3600);
        assert_eq!(amount, Some(33.33));
    }

    #[test]
    fn compute_amount_non_billable_returns_none() {
        assert_eq!(compute_amount(false, Some(60.0), 3600), None);
    }

    #[test]
    fn compute_amount_zero_rate_returns_none() {
        assert_eq!(compute_amount(true, Some(0.0), 3600), None);
        assert_eq!(compute_amount(true, None, 3600), None);
    }
}
