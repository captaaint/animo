pub mod routes;

use crate::error::AppError;
use crate::state::AppState;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum_extra::extract::cookie::CookieJar;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const SESSION_COOKIE: &str = "tt_session";
const SESSION_TOKEN_BYTES: usize = 32; // 256-bit
pub const SESSION_ABSOLUTE_DAYS: i64 = 30;
// Idle timeout: 7 days. Active sessions stay alive across short and medium
// inactivity gaps so the user doesn't get bounced to /login between work days.
pub const SESSION_IDLE_MINUTES: i64 = 60 * 24 * 7;

/// Generates a fresh random token (returned as base64url) and its SHA-256 hash
/// for storage. The plaintext only goes into the response cookie; the DB only
/// keeps the hash. See AUTH_GATE_PLAN.md §3.1, §10.4.
pub fn new_session_token() -> (String, Vec<u8>) {
    let mut buf = [0u8; SESSION_TOKEN_BYTES];
    rand::thread_rng().fill_bytes(&mut buf);
    let token = URL_SAFE_NO_PAD.encode(buf);
    let hash = Sha256::digest(token.as_bytes()).to_vec();
    (token, hash)
}

pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Inserts a fresh session row, returning the plaintext token to set in a cookie.
pub async fn create_session(
    state: &AppState,
    user_id: &str,
    ip: Option<&str>,
    user_agent: Option<&str>,
) -> Result<String, AppError> {
    let (token, hash) = new_session_token();
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let expires = now + Duration::days(SESSION_ABSOLUTE_DAYS);
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, ip, user_agent) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&hash)
    .bind(now.to_rfc3339())
    .bind(now.to_rfc3339())
    .bind(expires.to_rfc3339())
    .bind(ip)
    .bind(user_agent)
    .execute(&state.db)
    .await?;
    Ok(token)
}

pub async fn revoke_session_by_token(state: &AppState, token: &str) -> Result<(), AppError> {
    let hash = hash_token(token);
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
        .bind(&now)
        .bind(&hash)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub name: String,
}

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let token = jar
            .get(SESSION_COOKIE)
            .map(|c| c.value().to_string())
            .ok_or(AppError::Unauthorized)?;

        let hash = hash_token(&token);
        // Session row + user identity in a single round-trip.
        let row: Option<(String, String, String, String, String, Option<String>, String)> =
            sqlx::query_as(
                "SELECT s.id, s.user_id, s.last_seen_at, s.expires_at, u.email, u.name, u.id \
                 FROM sessions s JOIN users u ON u.id = s.user_id \
                 WHERE s.token_hash = ? AND s.revoked_at IS NULL",
            )
            .bind(&hash)
            .fetch_optional(&state.db)
            .await?;

        let (session_id, user_id, last_seen_at, expires_at, email, name, _) =
            row.ok_or(AppError::Unauthorized)?;

        let now = Utc::now();
        let expires = DateTime::parse_from_rfc3339(&expires_at)
            .map_err(|_| AppError::Unauthorized)?
            .with_timezone(&Utc);
        if expires <= now {
            return Err(AppError::Unauthorized);
        }
        let last_seen = DateTime::parse_from_rfc3339(&last_seen_at)
            .map_err(|_| AppError::Unauthorized)?
            .with_timezone(&Utc);
        if now - last_seen > Duration::minutes(SESSION_IDLE_MINUTES) {
            return Err(AppError::Unauthorized);
        }

        // Slide the idle window forward.
        sqlx::query("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
            .bind(now.to_rfc3339())
            .bind(&session_id)
            .execute(&state.db)
            .await?;

        // Optional name fallback when a future migration ever drops the NOT NULL.
        let name = name.unwrap_or_default();

        Ok(AuthUser {
            id: user_id,
            email,
            name,
        })
    }
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    use argon2::Argon2;
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("hash error: {e}")))
}

pub fn verify_password(password: &str, hash: &str) -> Result<(), AppError> {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    use argon2::Argon2;
    let parsed = PasswordHash::new(hash).map_err(|_| AppError::Unauthorized)?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| AppError::Unauthorized)
}
