/// Relational memory storage (Z-PI P2.1, ADR z-pi-local-relational-memory).
///
/// One batch so fresh databases and migrations cannot drift in table names,
/// checks, or indexes. All statements are idempotent (`IF NOT EXISTS`) so the
/// same batch serves both `SCHEMA_LATEST` assembly and the v20→v21 migration.
pub(crate) const MEMORY_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS memory_entities (
  id                TEXT PRIMARY KEY,
  profile_id        TEXT NOT NULL,
  project_id        INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  type              TEXT NOT NULL CHECK (type IN (
    'person', 'organization', 'location', 'object', 'event', 'technology', 'other'
  )),
  subtype           TEXT,
  name              TEXT NOT NULL,
  name_norm         TEXT NOT NULL,
  description       TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0.5,
  source_turn_id    TEXT,
  source_session_id TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'merged', 'deleted'
  ))
);
CREATE INDEX IF NOT EXISTS idx_memory_entities_scope
  ON memory_entities(profile_id, project_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_entities_dedup
  ON memory_entities(profile_id, project_id, name_norm)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS memory_mentions (
  id          TEXT PRIMARY KEY,
  entity_id   TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  session_id  TEXT,
  turn_id     TEXT,
  text_span   TEXT NOT NULL,
  span_start  INTEGER NOT NULL,
  span_end    INTEGER NOT NULL,
  confidence  REAL NOT NULL DEFAULT 0.5,
  occurred_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_mentions_entity
  ON memory_mentions(entity_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS memory_facts (
  id                 TEXT PRIMARY KEY,
  profile_id         TEXT NOT NULL,
  project_id         INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  subject_entity_id  TEXT REFERENCES memory_entities(id) ON DELETE CASCADE,
  predicate          TEXT NOT NULL,
  object_text        TEXT NOT NULL,
  object_entity_id   TEXT REFERENCES memory_entities(id) ON DELETE SET NULL,
  confidence         REAL NOT NULL DEFAULT 0.5,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'superseded', 'deleted'
  )),
  created_at         INTEGER NOT NULL,
  source_mention_id  TEXT REFERENCES memory_mentions(id) ON DELETE SET NULL,
  superseded_by      TEXT REFERENCES memory_facts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_facts_subject
  ON memory_facts(subject_entity_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_edges (
  entity_id          TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  relation           TEXT NOT NULL,
  target_entity_id   TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  confidence         REAL NOT NULL DEFAULT 0.5,
  first_seen_turn_id TEXT,
  last_seen_at       INTEGER NOT NULL,
  PRIMARY KEY (entity_id, relation, target_entity_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_memory_edges_target
  ON memory_edges(target_entity_id, relation);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  name, description,
  content='memory_entities', content_rowid='rowid',
  tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS memory_fts_ai AFTER INSERT ON memory_entities
  BEGIN
    INSERT INTO memory_fts(rowid, name, description)
    VALUES (new.rowid, new.name, COALESCE(new.description, ''));
  END;
CREATE TRIGGER IF NOT EXISTS memory_fts_ad AFTER DELETE ON memory_entities
  BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, name, description)
    VALUES ('delete', old.rowid, old.name, COALESCE(old.description, ''));
  END;
CREATE TRIGGER IF NOT EXISTS memory_fts_au AFTER UPDATE OF name, description ON memory_entities
  BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, name, description)
    VALUES ('delete', old.rowid, old.name, COALESCE(old.description, ''));
    INSERT INTO memory_fts(rowid, name, description)
    VALUES (new.rowid, new.name, COALESCE(new.description, ''));
  END;
"#;
