use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntryRow {
    pub id: String,
    pub user_id: String,
    pub project_id: Option<String>,
    pub description: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_seconds: i64,
    pub created_at: String,
    pub updated_at: String,
    pub billable: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntry {
    pub id: String,
    pub user_id: String,
    pub project_id: Option<String>,
    pub description: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_seconds: i64,
    pub created_at: String,
    pub updated_at: String,
    pub billable: bool,
    pub tag_ids: Vec<String>,
}

impl From<(TimeEntryRow, Vec<String>)> for TimeEntry {
    fn from((row, tag_ids): (TimeEntryRow, Vec<String>)) -> Self {
        TimeEntry {
            id: row.id,
            user_id: row.user_id,
            project_id: row.project_id,
            description: row.description,
            start_time: row.start_time,
            end_time: row.end_time,
            duration_seconds: row.duration_seconds,
            created_at: row.created_at,
            updated_at: row.updated_at,
            billable: row.billable,
            tag_ids,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntryReq {
    pub project_id: Option<String>,
    #[serde(default)]
    pub description: String,
    pub start_time: String,
    pub end_time: String,
    #[serde(default)]
    pub billable: bool,
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEntryReq {
    pub project_id: Option<Option<String>>,
    pub description: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub billable: Option<bool>,
    pub tag_ids: Option<Vec<String>>,
}

fn parse_iso(s: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| AppError::BadRequest(format!("invalid timestamp: {e}")))
}

fn duration_secs(start: &str, end: &str) -> Result<i64, AppError> {
    let s = parse_iso(start)?;
    let e = parse_iso(end)?;
    if e <= s {
        return Err(AppError::Validation("end_time must be after start_time".into()));
    }
    Ok((e - s).num_seconds())
}

async fn project_belongs(state: &AppState, user_id: &str, project_id: &str) -> AppResult<()> {
    let owns: Option<(String,)> =
        sqlx::query_as("SELECT id FROM projects WHERE id = ? AND user_id = ?")
            .bind(project_id)
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;
    if owns.is_none() {
        return Err(AppError::BadRequest("project_id not found".into()));
    }
    Ok(())
}

async fn fetch_tag_ids_for_entries(
    state: &AppState,
    entry_ids: &[String],
) -> AppResult<std::collections::HashMap<String, Vec<String>>> {
    use std::collections::HashMap;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    if entry_ids.is_empty() {
        return Ok(map);
    }
    let placeholders = entry_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT entry_id, tag_id FROM entry_tags WHERE entry_id IN ({placeholders}) ORDER BY tag_id"
    );
    let mut query = sqlx::query_as::<_, (String, String)>(&sql);
    for id in entry_ids {
        query = query.bind(id);
    }
    let rows: Vec<(String, String)> = query.fetch_all(&state.db).await?;
    for (entry_id, tag_id) in rows {
        map.entry(entry_id).or_default().push(tag_id);
    }
    Ok(map)
}

async fn validate_tags(state: &AppState, user_id: &str, tag_ids: &[String]) -> AppResult<()> {
    if tag_ids.is_empty() {
        return Ok(());
    }
    let placeholders = tag_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT COUNT(*) FROM tags WHERE user_id = ? AND id IN ({placeholders})");
    let mut q = sqlx::query_as::<_, (i64,)>(&sql).bind(user_id);
    for id in tag_ids {
        q = q.bind(id);
    }
    let (count,): (i64,) = q.fetch_one(&state.db).await?;
    if (count as usize) != tag_ids.len() {
        return Err(AppError::BadRequest("one or more tag ids not found".into()));
    }
    Ok(())
}

async fn replace_entry_tags(
    state: &AppState,
    entry_id: &str,
    tag_ids: &[String],
) -> AppResult<()> {
    sqlx::query("DELETE FROM entry_tags WHERE entry_id = ?")
        .bind(entry_id)
        .execute(&state.db)
        .await?;
    for tag_id in tag_ids {
        sqlx::query("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)")
            .bind(entry_id)
            .bind(tag_id)
            .execute(&state.db)
            .await?;
    }
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<TimeEntry>>> {
    let from = q.from.as_deref().unwrap_or("0000-01-01");
    let to_inclusive_end = match q.to.as_deref() {
        Some(d) => format!("{d}T23:59:59.999Z"),
        None => "9999-12-31T23:59:59.999Z".to_string(),
    };
    let from_iso = format!("{from}T00:00:00.000Z");

    let rows: Vec<TimeEntryRow> = sqlx::query_as(
        "SELECT id, user_id, project_id, description, start_time, end_time, \
         duration_seconds, created_at, updated_at, billable \
         FROM time_entries \
         WHERE user_id = ? AND start_time >= ? AND start_time <= ? \
         ORDER BY start_time DESC",
    )
    .bind(&user.id)
    .bind(&from_iso)
    .bind(&to_inclusive_end)
    .fetch_all(&state.db)
    .await?;
    let entry_ids: Vec<String> = rows.iter().map(|r| r.id.clone()).collect();
    let tag_map = fetch_tag_ids_for_entries(&state, &entry_ids).await?;
    let out: Vec<TimeEntry> = rows
        .into_iter()
        .map(|r| {
            let tags = tag_map.get(&r.id).cloned().unwrap_or_default();
            TimeEntry::from((r, tags))
        })
        .collect();
    Ok(Json(out))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<CreateEntryReq>,
) -> AppResult<Json<TimeEntry>> {
    if let Some(pid) = &payload.project_id {
        project_belongs(&state, &user.id, pid).await?;
    }
    validate_tags(&state, &user.id, &payload.tag_ids).await?;
    let dur = duration_secs(&payload.start_time, &payload.end_time)?;

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO time_entries \
         (id, user_id, project_id, description, start_time, end_time, duration_seconds, billable) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&user.id)
    .bind(payload.project_id.as_deref())
    .bind(&payload.description)
    .bind(&payload.start_time)
    .bind(&payload.end_time)
    .bind(dur)
    .bind(payload.billable as i64)
    .execute(&state.db)
    .await?;

    replace_entry_tags(&state, &id, &payload.tag_ids).await?;

    let row: TimeEntryRow = sqlx::query_as(
        "SELECT id, user_id, project_id, description, start_time, end_time, \
         duration_seconds, created_at, updated_at, billable \
         FROM time_entries WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(TimeEntry::from((row, payload.tag_ids))))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateEntryReq>,
) -> AppResult<Json<TimeEntry>> {
    let existing: TimeEntryRow = sqlx::query_as(
        "SELECT id, user_id, project_id, description, start_time, end_time, \
         duration_seconds, created_at, updated_at, billable \
         FROM time_entries WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let project_id = match payload.project_id {
        Some(opt) => opt,
        None => existing.project_id,
    };
    let description = payload.description.unwrap_or(existing.description);
    let start_time = payload.start_time.unwrap_or(existing.start_time);
    let end_time = payload.end_time.unwrap_or(existing.end_time);
    let billable = payload.billable.unwrap_or(existing.billable);

    if let Some(pid) = &project_id {
        project_belongs(&state, &user.id, pid).await?;
    }
    let dur = duration_secs(&start_time, &end_time)?;

    if let Some(tag_ids) = &payload.tag_ids {
        validate_tags(&state, &user.id, tag_ids).await?;
    }

    sqlx::query(
        "UPDATE time_entries SET project_id = ?, description = ?, \
         start_time = ?, end_time = ?, duration_seconds = ?, billable = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .bind(project_id.as_deref())
    .bind(&description)
    .bind(&start_time)
    .bind(&end_time)
    .bind(dur)
    .bind(billable as i64)
    .bind(&id)
    .execute(&state.db)
    .await?;

    if let Some(tag_ids) = &payload.tag_ids {
        replace_entry_tags(&state, &id, tag_ids).await?;
    }

    let row: TimeEntryRow = sqlx::query_as(
        "SELECT id, user_id, project_id, description, start_time, end_time, \
         duration_seconds, created_at, updated_at, billable \
         FROM time_entries WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await?;
    let final_tag_ids = if let Some(ts) = payload.tag_ids {
        ts
    } else {
        let map = fetch_tag_ids_for_entries(&state, &[id.clone()]).await?;
        map.get(&id).cloned().unwrap_or_default()
    };
    Ok(Json(TimeEntry::from((row, final_tag_ids))))
}

pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let res = sqlx::query("DELETE FROM time_entries WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
