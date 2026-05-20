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
pub struct Tag {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateTagReq {
    #[validate(length(min = 1))]
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateTagReq {
    pub name: Option<String>,
    pub color: Option<String>,
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<Tag>>> {
    let rows: Vec<Tag> = sqlx::query_as(
        "SELECT id, user_id, name, color, created_at FROM tags \
         WHERE user_id = ? ORDER BY name",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<CreateTagReq>,
) -> AppResult<Json<Tag>> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let id = Uuid::new_v4().to_string();
    let color = payload.color.unwrap_or_else(|| "#3F8F8C".to_string()); // Sage Teal
    let res = sqlx::query("INSERT INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&user.id)
        .bind(&payload.name)
        .bind(&color)
        .execute(&state.db)
        .await;
    if let Err(e) = res {
        let msg = e.to_string();
        if msg.contains("UNIQUE") {
            return Err(AppError::BadRequest("tag name already exists".into()));
        }
        return Err(AppError::Db(e));
    }
    let row: Tag =
        sqlx::query_as("SELECT id, user_id, name, color, created_at FROM tags WHERE id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await?;
    Ok(Json(row))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateTagReq>,
) -> AppResult<Json<Tag>> {
    let existing: Tag = sqlx::query_as(
        "SELECT id, user_id, name, color, created_at FROM tags WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let name = payload.name.unwrap_or(existing.name);
    let color = payload.color.unwrap_or(existing.color);

    sqlx::query("UPDATE tags SET name = ?, color = ? WHERE id = ?")
        .bind(&name)
        .bind(&color)
        .bind(&id)
        .execute(&state.db)
        .await?;

    let row: Tag =
        sqlx::query_as("SELECT id, user_id, name, color, created_at FROM tags WHERE id = ?")
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
    let res = sqlx::query("DELETE FROM tags WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
