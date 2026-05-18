-- Tags: a second classification dimension next to projects. Free-form, per-user.
CREATE TABLE tags (
    id         TEXT PRIMARY KEY NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#64748b',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (user_id, name)
);
CREATE INDEX idx_tags_user_id ON tags(user_id);

-- Many-to-many between time entries and tags.
CREATE TABLE entry_tags (
    entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
);
CREATE INDEX idx_entry_tags_tag_id ON entry_tags(tag_id);
