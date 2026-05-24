use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: String,
    pub username: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn username_from_email(email: &str) -> String {
    let local = email.split('@').next().unwrap_or(email);
    normalize_username(local)
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
