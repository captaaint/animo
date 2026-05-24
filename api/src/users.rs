use crate::error::AppError;
use crate::state::AppState;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use serde::{Deserialize, Serialize};
use sqlx::{Sqlite, SqlitePool, Transaction};
use std::ops::Deref;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: String,
    pub username: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LocalUser(pub User);

impl Deref for LocalUser {
    type Target = User;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[axum::async_trait]
impl FromRequestParts<AppState> for LocalUser {
    type Rejection = AppError;

    async fn from_request_parts(
        _parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, name, username, created_at, updated_at FROM users ORDER BY created_at LIMIT 1",
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::SetupRequired)?;

        Ok(LocalUser(user))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub id: i64,
    pub user_id: String,
    pub theme: String,
    pub ui_density: String,
    pub date_format: String,
    pub time_format: String,
    pub preferences_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePreferencesRequest {
    pub theme: Option<String>,
    pub ui_density: Option<String>,
    pub date_format: Option<String>,
    pub time_format: Option<String>,
    pub preferences_json: Option<String>,
}

pub fn username_from_email(email: &str) -> String {
    let local = email.split('@').next().unwrap_or(email);
    normalize_username(local)
}

pub async fn create_default_preferences_tx(
    tx: &mut Transaction<'_, Sqlite>,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO user_preferences (user_id) VALUES (?)")
        .bind(user_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

pub async fn ensure_default_preferences(
    db: &SqlitePool,
    user_id: &str,
) -> Result<UserPreferences, sqlx::Error> {
    sqlx::query("INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)")
        .bind(user_id)
        .execute(db)
        .await?;
    get_preferences(db, user_id).await
}

pub async fn get_preferences(
    db: &SqlitePool,
    user_id: &str,
) -> Result<UserPreferences, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, user_id, theme, ui_density, date_format, time_format, \
            preferences_json, created_at, updated_at \
         FROM user_preferences WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_one(db)
    .await
}

pub async fn update_preferences(
    db: &SqlitePool,
    user_id: &str,
    updates: UpdatePreferencesRequest,
) -> Result<UserPreferences, sqlx::Error> {
    let current = ensure_default_preferences(db, user_id).await?;
    let theme = updates.theme.unwrap_or(current.theme);
    let ui_density = updates.ui_density.unwrap_or(current.ui_density);
    let date_format = updates.date_format.unwrap_or(current.date_format);
    let time_format = updates.time_format.unwrap_or(current.time_format);
    let preferences_json = updates.preferences_json.unwrap_or(current.preferences_json);

    sqlx::query(
        "UPDATE user_preferences \
         SET theme = ?, ui_density = ?, date_format = ?, time_format = ?, preferences_json = ? \
         WHERE user_id = ?",
    )
    .bind(&theme)
    .bind(&ui_density)
    .bind(&date_format)
    .bind(&time_format)
    .bind(&preferences_json)
    .bind(user_id)
    .execute(db)
    .await?;

    get_preferences(db, user_id).await
}

fn normalize_username(value: &str) -> String {
    let mut username = String::new();
    let mut last_was_separator = false;

    for ch in value.trim().chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            username.push(ch);
            last_was_separator = false;
        } else if !last_was_separator {
            username.push('_');
            last_was_separator = true;
        }
    }

    let username = username.trim_matches('_').to_string();
    if username.is_empty() {
        "user".to_string()
    } else {
        username
    }
}
