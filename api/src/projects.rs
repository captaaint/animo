use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub user_id: String,
    pub client_id: Option<String>,
    pub name: String,
    pub color: String,
    pub archived: bool,
    pub created_at: String,
    pub hourly_rate: f64,
    pub currency: String,
}

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectReq {
    #[validate(length(min = 1))]
    pub name: String,
    pub client_id: Option<String>,
    pub color: Option<String>,
    pub hourly_rate: Option<f64>,
    pub currency: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectReq {
    pub name: Option<String>,
    pub client_id: Option<Option<String>>,
    pub color: Option<String>,
    pub archived: Option<bool>,
    pub hourly_rate: Option<f64>,
    pub currency: Option<String>,
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<Project>>> {
    let rows: Vec<Project> = sqlx::query_as(
        "SELECT id, user_id, client_id, name, color, archived, created_at, hourly_rate, currency \
         FROM projects WHERE user_id = ? ORDER BY name",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<CreateProjectReq>,
) -> AppResult<Json<Project>> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    if let Some(cid) = &payload.client_id {
        let owns: Option<(String,)> =
            sqlx::query_as("SELECT id FROM clients WHERE id = ? AND user_id = ?")
                .bind(cid)
                .bind(&user.id)
                .fetch_optional(&state.db)
                .await?;
        if owns.is_none() {
            return Err(AppError::BadRequest("client_id not found".into()));
        }
    }

    let id = Uuid::new_v4().to_string();
    let color = payload.color.unwrap_or_else(|| "#3F8F8C".to_string()); // Sage Teal
    let hourly_rate = payload.hourly_rate.unwrap_or(0.0).max(0.0);
    let currency = payload
        .currency
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| "EUR".to_string());
    sqlx::query(
        "INSERT INTO projects (id, user_id, client_id, name, color, hourly_rate, currency) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&user.id)
    .bind(payload.client_id.as_deref())
    .bind(&payload.name)
    .bind(&color)
    .bind(hourly_rate)
    .bind(&currency)
    .execute(&state.db)
    .await?;
    let row: Project = sqlx::query_as(
        "SELECT id, user_id, client_id, name, color, archived, created_at, hourly_rate, currency \
         FROM projects WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(row))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateProjectReq>,
) -> AppResult<Json<Project>> {
    let existing: Project = sqlx::query_as(
        "SELECT id, user_id, client_id, name, color, archived, created_at, hourly_rate, currency \
         FROM projects WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let name = payload.name.unwrap_or(existing.name);
    let color = payload.color.unwrap_or(existing.color);
    let archived = payload.archived.unwrap_or(existing.archived);
    let hourly_rate = payload.hourly_rate.unwrap_or(existing.hourly_rate).max(0.0);
    let currency = payload
        .currency
        .filter(|c| !c.is_empty())
        .unwrap_or(existing.currency);
    let client_id = match payload.client_id {
        Some(opt) => opt,
        None => existing.client_id,
    };

    if let Some(cid) = &client_id {
        let owns: Option<(String,)> =
            sqlx::query_as("SELECT id FROM clients WHERE id = ? AND user_id = ?")
                .bind(cid)
                .bind(&user.id)
                .fetch_optional(&state.db)
                .await?;
        if owns.is_none() {
            return Err(AppError::BadRequest("client_id not found".into()));
        }
    }

    sqlx::query(
        "UPDATE projects SET name = ?, color = ?, archived = ?, client_id = ?, \
         hourly_rate = ?, currency = ? WHERE id = ?",
    )
    .bind(&name)
    .bind(&color)
    .bind(archived as i64)
    .bind(client_id.as_deref())
    .bind(hourly_rate)
    .bind(&currency)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row: Project = sqlx::query_as(
        "SELECT id, user_id, client_id, name, color, archived, created_at, hourly_rate, currency \
         FROM projects WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let res = sqlx::query("DELETE FROM projects WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
