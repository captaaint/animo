use crate::error::AppError;
use crate::error::AppResult;
use crate::state::AppState;
use axum::extract::{FromRequestParts, State};
use axum::http::request::Parts;
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::{Sqlite, SqlitePool, Transaction};
use std::ops::Deref;
use uuid::Uuid;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWithPreferences {
    pub id: String,
    pub name: String,
    pub username: String,
    pub created_at: String,
    pub updated_at: String,
    pub preferences: UserPreferences,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResponse {
    pub setup_complete: bool,
    pub user: Option<UserWithPreferences>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserRequest {
    pub name: String,
    pub username: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserRequest {
    pub name: Option<String>,
    pub username: Option<String>,
    pub preferences: Option<UpdatePreferencesRequest>,
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

pub async fn get_bootstrap_status(
    State(state): State<AppState>,
) -> AppResult<Json<BootstrapResponse>> {
    let user = first_user(&state.db).await?;
    let user = match user {
        Some(user) => Some(user_with_preferences(&state.db, user).await?),
        None => None,
    };

    Ok(Json(BootstrapResponse {
        setup_complete: user.is_some(),
        user,
    }))
}

pub async fn create_first_user(
    State(state): State<AppState>,
    Json(payload): Json<CreateUserRequest>,
) -> AppResult<Json<UserWithPreferences>> {
    let existing: Option<(String,)> = sqlx::query_as("SELECT id FROM users LIMIT 1")
        .fetch_optional(&state.db)
        .await?;
    if existing.is_some() {
        return Err(AppError::Conflict("user already exists".into()));
    }

    validate_display_name(&payload.name)?;
    validate_username(&payload.username)?;

    let id = Uuid::new_v4().to_string();
    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT INTO users (id, name, username) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(payload.name.trim())
        .bind(payload.username.trim())
        .execute(&mut *tx)
        .await?;
    create_default_preferences_tx(&mut tx, &id).await?;
    tx.commit().await?;

    let user = get_user(&state.db, &id).await?;
    Ok(Json(user_with_preferences(&state.db, user).await?))
}

pub async fn get_current_user(
    State(state): State<AppState>,
    LocalUser(user): LocalUser,
) -> AppResult<Json<UserWithPreferences>> {
    Ok(Json(user_with_preferences(&state.db, user).await?))
}

pub async fn update_current_user(
    State(state): State<AppState>,
    LocalUser(user): LocalUser,
    Json(payload): Json<UpdateUserRequest>,
) -> AppResult<Json<UserWithPreferences>> {
    let name = match payload.name {
        Some(name) => {
            validate_display_name(&name)?;
            name.trim().to_string()
        }
        None => user.name.clone(),
    };
    let username = match payload.username {
        Some(username) => {
            validate_username(&username)?;
            let exists: Option<(String,)> =
                sqlx::query_as("SELECT id FROM users WHERE username = ? AND id <> ?")
                    .bind(username.trim())
                    .bind(&user.id)
                    .fetch_optional(&state.db)
                    .await?;
            if exists.is_some() {
                return Err(AppError::Conflict("username already exists".into()));
            }
            username.trim().to_string()
        }
        None => user.username.clone(),
    };

    sqlx::query(
        "UPDATE users \
         SET name = ?, username = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') \
         WHERE id = ?",
    )
    .bind(&name)
    .bind(&username)
    .bind(&user.id)
    .execute(&state.db)
    .await?;

    if let Some(preferences) = payload.preferences {
        update_preferences(&state.db, &user.id, preferences).await?;
    }

    let user = get_user(&state.db, &user.id).await?;
    Ok(Json(user_with_preferences(&state.db, user).await?))
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

async fn first_user(db: &SqlitePool) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, name, username, created_at, updated_at FROM users ORDER BY created_at LIMIT 1",
    )
    .fetch_optional(db)
    .await
}

async fn get_user(db: &SqlitePool, user_id: &str) -> Result<User, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, name, username, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(user_id)
    .fetch_one(db)
    .await
}

async fn user_with_preferences(
    db: &SqlitePool,
    user: User,
) -> Result<UserWithPreferences, sqlx::Error> {
    let preferences = ensure_default_preferences(db, &user.id).await?;
    Ok(UserWithPreferences {
        id: user.id,
        name: user.name,
        username: user.username,
        created_at: user.created_at,
        updated_at: user.updated_at,
        preferences,
    })
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
) -> AppResult<UserPreferences> {
    validate_preferences_update(&updates)?;
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

    get_preferences(db, user_id).await.map_err(AppError::from)
}

fn validate_display_name(name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("name is required".into()));
    }
    if name.len() > 80 {
        return Err(AppError::Validation(
            "name must be 80 characters or fewer".into(),
        ));
    }
    Ok(())
}

fn validate_username(username: &str) -> AppResult<()> {
    let username = username.trim();
    if username.len() < 3 || username.len() > 30 {
        return Err(AppError::Validation(
            "username must be between 3 and 30 characters".into(),
        ));
    }
    if !username
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
    {
        return Err(AppError::Validation(
            "username may only contain letters, numbers, and underscores".into(),
        ));
    }
    Ok(())
}

fn validate_preferences_update(updates: &UpdatePreferencesRequest) -> AppResult<()> {
    if let Some(theme) = &updates.theme {
        if !matches!(theme.as_str(), "light" | "dark" | "system") {
            return Err(AppError::Validation(
                "theme must be light, dark, or system".into(),
            ));
        }
    }
    if let Some(ui_density) = &updates.ui_density {
        if !matches!(ui_density.as_str(), "compact" | "comfortable" | "spacious") {
            return Err(AppError::Validation(
                "uiDensity must be compact, comfortable, or spacious".into(),
            ));
        }
    }
    if let Some(time_format) = &updates.time_format {
        if !matches!(time_format.as_str(), "12h" | "24h") {
            return Err(AppError::Validation("timeFormat must be 12h or 24h".into()));
        }
    }
    if let Some(preferences_json) = &updates.preferences_json {
        serde_json::from_str::<serde_json::Value>(preferences_json).map_err(|e| {
            AppError::Validation(format!("preferencesJson must be valid JSON: {e}"))
        })?;
    }
    Ok(())
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
