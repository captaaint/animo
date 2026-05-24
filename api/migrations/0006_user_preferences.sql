-- Per-user local preferences. The user_id remains TEXT to match the existing
-- UUID-style users.id primary key.
CREATE TABLE user_preferences (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    theme            TEXT NOT NULL DEFAULT 'system'
                         CHECK (theme IN ('light', 'dark', 'system')),
    ui_density       TEXT NOT NULL DEFAULT 'comfortable'
                         CHECK (ui_density IN ('compact', 'comfortable', 'spacious')),
    date_format      TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    time_format      TEXT NOT NULL DEFAULT '24h'
                         CHECK (time_format IN ('12h', '24h')),
    preferences_json TEXT NOT NULL DEFAULT '{}',
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

INSERT INTO user_preferences (user_id)
SELECT id
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM user_preferences WHERE user_preferences.user_id = users.id
);

CREATE TRIGGER set_user_preferences_updated_at
AFTER UPDATE ON user_preferences
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE user_preferences
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = NEW.id;
END;
