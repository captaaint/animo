use crate::auth::{
    create_session, hash_password, revoke_session_by_token, verify_password, AuthUser,
    SESSION_ABSOLUTE_DAYS, SESSION_COOKIE,
};
use crate::config::CookieSameSite;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::users::{create_default_preferences_tx, username_from_email};
use axum::extract::State;
use axum::http::header::{HeaderMap, USER_AGENT};
use axum::response::IntoResponse;
use axum::Json;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};
use serde_json::json;
use time::Duration as TimeDuration;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterReq {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 3))]
    pub password: String,
    #[validate(length(min = 1))]
    pub name: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct LoginReq {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 1))]
    pub password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPayload {
    pub id: String,
    pub email: String,
    pub name: String,
    pub username: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

impl UserPayload {
    fn for_user(id: String, email: String, name: String, username: String) -> Self {
        // RBAC seed table is on the v2 plan roadmap; until then everyone is
        // treated as "user" with the standard own-resource permissions
        // (matches what the SPA expects from /auth/me — see plan §3.6).
        Self {
            id,
            email,
            name,
            username,
            roles: vec!["user".into()],
            permissions: vec![
                "time_entry.read_own".into(),
                "time_entry.write_own".into(),
                "time_entry.delete_own".into(),
                "project.read_own".into(),
                "project.write_own".into(),
                "client.read_own".into(),
                "report.read_own".into(),
            ],
        }
    }
}

fn same_site_from_cfg(cfg: CookieSameSite) -> SameSite {
    // Map our config enum onto the cookie crate's variant. We intentionally
    // ignore SameSite::Strict — neither deployment mode needs it.
    match cfg {
        CookieSameSite::None => SameSite::None,
        CookieSameSite::Lax => SameSite::Lax,
    }
}

fn build_session_cookie(token: String, same_site: CookieSameSite, secure: bool) -> Cookie<'static> {
    let max_age = TimeDuration::days(SESSION_ABSOLUTE_DAYS);
    Cookie::build((SESSION_COOKIE, token))
        .http_only(true)
        // Browser dev mode keeps Secure=true (SameSite=None requires it, and
        // loopback origins count as "potentially trustworthy"). Desktop mode
        // turns it off — WKWebView on macOS silently rejects Secure cookies
        // arriving over plain http://localhost, and without persistence the
        // session never sticks.
        .secure(secure)
        .same_site(same_site_from_cfg(same_site))
        .path("/")
        .max_age(max_age)
        .build()
}

fn cleared_session_cookie(same_site: CookieSameSite, secure: bool) -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, ""))
        .http_only(true)
        .secure(secure)
        .same_site(same_site_from_cfg(same_site))
        .path("/")
        .max_age(TimeDuration::seconds(0))
        .build()
}

fn user_agent_str(headers: &HeaderMap) -> Option<String> {
    headers
        .get(USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

pub async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(payload): Json<RegisterReq>,
) -> AppResult<impl IntoResponse> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM users WHERE email = ?")
        .bind(&payload.email)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_some() {
        return Err(AppError::Conflict("email already registered".into()));
    }

    let hash = hash_password(&payload.password)?;
    let id = Uuid::new_v4().to_string();
    let username = username_from_email(&payload.email);
    let username_exists: Option<(String,)> =
        sqlx::query_as("SELECT id FROM users WHERE username = ?")
            .bind(&username)
            .fetch_optional(&state.db)
            .await?;
    if username_exists.is_some() {
        return Err(AppError::Conflict("username already registered".into()));
    }

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, name, username) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&payload.email)
    .bind(&hash)
    .bind(&payload.name)
    .bind(&username)
    .execute(&mut *tx)
    .await?;
    create_default_preferences_tx(&mut tx, &id).await?;
    tx.commit().await?;

    let ua = user_agent_str(&headers);
    let token = create_session(&state, &id, None, ua.as_deref()).await?;
    let user = UserPayload::for_user(id, payload.email, payload.name, username);
    let jar = jar.add(build_session_cookie(
        token,
        state.config.cookie_same_site,
        state.config.cookie_secure,
    ));
    Ok((jar, Json(json!({ "user": user }))))
}

pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(payload): Json<LoginReq>,
) -> AppResult<impl IntoResponse> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let row: Option<(String, String, String, String, String)> = sqlx::query_as(
        "SELECT id, email, password_hash, name, username FROM users WHERE email = ?",
    )
    .bind(&payload.email)
    .fetch_optional(&state.db)
    .await?;
    let (id, email, hash, name, username) = row.ok_or(AppError::Unauthorized)?;
    verify_password(&payload.password, &hash)?;

    let ua = user_agent_str(&headers);
    let token = create_session(&state, &id, None, ua.as_deref()).await?;
    let user = UserPayload::for_user(id, email, name, username);
    let jar = jar.add(build_session_cookie(
        token,
        state.config.cookie_same_site,
        state.config.cookie_secure,
    ));
    Ok((jar, Json(json!({ "user": user }))))
}

pub async fn me(user: AuthUser) -> AppResult<Json<serde_json::Value>> {
    let payload = UserPayload::for_user(user.id, user.email, user.name, user.username);
    Ok(Json(json!({ "user": payload })))
}

pub async fn logout(State(state): State<AppState>, jar: CookieJar) -> AppResult<impl IntoResponse> {
    if let Some(c) = jar.get(SESSION_COOKIE) {
        let _ = revoke_session_by_token(&state, c.value()).await;
    }
    let jar = jar.add(cleared_session_cookie(
        state.config.cookie_same_site,
        state.config.cookie_secure,
    ));
    Ok((jar, Json(json!({ "ok": true }))))
}
