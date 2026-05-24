-- Move users toward the local profile model while keeping the transitional
-- auth columns nullable until the auth removal migration lands.
CREATE TABLE users_new (
    id            TEXT PRIMARY KEY NOT NULL,
    email         TEXT UNIQUE,
    password_hash TEXT,
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

WITH normalized AS (
    SELECT
        id,
        email,
        password_hash,
        name,
        created_at,
        LOWER(
            REPLACE(
                TRIM(
                    CASE
                        WHEN email IS NOT NULL AND INSTR(email, '@') > 1
                            THEN SUBSTR(email, 1, INSTR(email, '@') - 1)
                        WHEN email IS NOT NULL AND LENGTH(TRIM(email)) > 0
                            THEN email
                        WHEN LENGTH(TRIM(name)) > 0
                            THEN name
                        ELSE 'user'
                    END
                ),
                ' ',
                '_'
            )
        ) AS base_username
    FROM users
),
ranked AS (
    SELECT
        *,
        COUNT(*) OVER (PARTITION BY base_username) AS username_count
    FROM normalized
)
INSERT INTO users_new (id, email, password_hash, name, username, created_at, updated_at)
SELECT
    id,
    email,
    password_hash,
    name,
    CASE
        WHEN username_count = 1 THEN base_username
        ELSE base_username || '_' || SUBSTR(REPLACE(id, '-', ''), 1, 8)
    END,
    created_at,
    created_at
FROM ranked;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
