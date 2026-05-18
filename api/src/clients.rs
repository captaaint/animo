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
pub struct Client {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub color: String,
    pub archived: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateClientReq {
    #[validate(length(min = 1))]
    pub name: String,
    #[validate(length(min = 1))]
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateClientReq {
    pub name: Option<String>,
    pub color: Option<String>,
    pub archived: Option<bool>,
}

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<Client>>> {
    let rows: Vec<Client> = sqlx::query_as(
        "SELECT id, user_id, name, color, archived, created_at \
         FROM clients WHERE user_id = ? ORDER BY name",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<CreateClientReq>,
) -> AppResult<Json<Client>> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let id = Uuid::new_v4().to_string();
    let color = payload.color.unwrap_or_else(|| "#3b82f6".to_string());
    sqlx::query(
        "INSERT INTO clients (id, user_id, name, color) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&user.id)
    .bind(&payload.name)
    .bind(&color)
    .execute(&state.db)
    .await?;
    let row: Client = sqlx::query_as(
        "SELECT id, user_id, name, color, archived, created_at FROM clients WHERE id = ?",
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
    Json(payload): Json<UpdateClientReq>,
) -> AppResult<Json<Client>> {
    let existing: Client = sqlx::query_as(
        "SELECT id, user_id, name, color, archived, created_at FROM clients WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let name = payload.name.unwrap_or(existing.name);
    let color = payload.color.unwrap_or(existing.color);
    let archived = payload.archived.unwrap_or(existing.archived);
    sqlx::query("UPDATE clients SET name = ?, color = ?, archived = ? WHERE id = ?")
        .bind(&name)
        .bind(&color)
        .bind(archived as i64)
        .bind(&id)
        .execute(&state.db)
        .await?;

    let row: Client = sqlx::query_as(
        "SELECT id, user_id, name, color, archived, created_at FROM clients WHERE id = ?",
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
    let res = sqlx::query("DELETE FROM clients WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
