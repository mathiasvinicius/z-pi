//! Profile-scoped relational memory (Z-PI P2.1, ADR z-pi-local-relational-memory).
//!
//! Storage lives in the host-core SQLite database; every row is bound to a
//! `profile_id` and optionally a `project_id`, so cross-profile or
//! cross-project leakage is impossible by query construction. Corrections
//! supersede facts instead of overwriting them, and every assertion keeps
//! mention-level provenance.

use crate::db::{now_ms, Result};
use rusqlite::params;
use serde::Serialize;
use uuid::Uuid;

/// Memory scope: the whole profile or one project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MemoryScope {
    Profile,
    Project,
}

/// Normalized entity key used for exact deduplication within one scope.
pub(crate) fn normalize_name(name: &str) -> String {
    name.trim().to_lowercase()
}

/// A stored entity row.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntityRecord {
    pub id: String,
    pub profile_id: String,
    pub project_id: Option<i64>,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub subtype: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub confidence: f64,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A mention provenance row.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryMentionRecord {
    pub id: String,
    pub entity_id: String,
    pub session_id: Option<String>,
    pub turn_id: Option<String>,
    pub text_span: String,
    pub span_start: i64,
    pub span_end: i64,
    pub confidence: f64,
    pub occurred_at: i64,
}

/// A stored fact row. Corrections supersede; they never overwrite.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFactRecord {
    pub id: String,
    pub subject_entity_id: Option<String>,
    pub predicate: String,
    pub object_text: String,
    pub object_entity_id: Option<String>,
    pub confidence: f64,
    pub status: String,
    pub created_at: i64,
    pub superseded_by: Option<String>,
}

/// A typed relation between two entities (graph edge). `same_as` is the
/// reserved relation for deduplication review, mirroring neo4j-labs
/// agent-memory's `SAME_AS` flag.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEdgeRecord {
    pub entity_id: String,
    pub relation: String,
    pub target_entity_id: String,
    pub confidence: f64,
    pub last_seen_at: i64,
}

pub(crate) const MEMORY_ENTITY_TYPES: [&str; 7] = [
    "person",
    "organization",
    "location",
    "object",
    "event",
    "technology",
    "other",
];

impl MemoryScope {
    /// SQL filter and its bound value for the scope. `None` value means the
    /// filter is a constant (`project_id IS NULL`).
    fn project_filter(self, project_id: Option<i64>) -> (String, Option<i64>) {
        match self {
            MemoryScope::Profile => ("project_id IS NULL".to_string(), None),
            MemoryScope::Project => ("project_id = ?".to_string(), project_id.or(Some(-1))),
        }
    }
}

/// Placeholder-counting helper so dynamic filters keep rusqlite's
/// sequential `?` binds aligned with the assembled SQL.
struct Binds {
    sql_values: Vec<String>,
}

impl Binds {
    fn new() -> Self {
        Self {
            sql_values: Vec::new(),
        }
    }
    fn push(&mut self, value: impl Into<String>) -> usize {
        self.sql_values.push(value.into());
        self.sql_values.len()
    }
}

impl crate::db::Database {
    fn memory_scope_guard(
        &self,
        scope: MemoryScope,
        project_id: Option<i64>,
    ) -> Result<(String, Option<i64>)> {
        if scope == MemoryScope::Project && project_id.is_none() {
            return Err(crate::db::anyhow!(
                "project-scoped memory requires a project id"
            ));
        }
        Ok(scope.project_filter(project_id))
    }

    /// Insert-or-merge an entity. An exact `name_norm` collision within the
    /// same scope updates the existing row (higher confidence wins) instead
    /// of creating a duplicate.
    #[allow(clippy::too_many_arguments)]
    pub fn memory_entity_upsert(
        &self,
        profile_id: &str,
        scope: MemoryScope,
        project_id: Option<i64>,
        entity_type: &str,
        subtype: Option<&str>,
        name: &str,
        description: Option<&str>,
        confidence: f64,
        source_turn_id: Option<&str>,
        source_session_id: Option<&str>,
    ) -> Result<MemoryEntityRecord> {
        if !MEMORY_ENTITY_TYPES.contains(&entity_type) {
            return Err(crate::db::anyhow!(
                "unsupported memory entity type {entity_type}"
            ));
        }
        let name_norm = normalize_name(name);
        if name_norm.is_empty() {
            return Err(crate::db::anyhow!("memory entity name is empty"));
        }
        let (filter, filter_arg) = self.memory_scope_guard(scope, project_id)?;
        let now = now_ms();
        let conn = self.conn();

        // Look up an active same-named entity first so the unique index never
        // turns a re-observation into a constraint error.
        let existing: Option<(String, f64)> = {
            let mut binds = Binds::new();
            let p_profile = binds.push(profile_id);
            let filter_sql = match filter_arg {
                Some(_) => {
                    let p = binds.push(filter_arg.unwrap_or(-1).to_string());
                    format!("project_id = ?{p}")
                }
                None => filter.clone(),
            };
            let p_name = binds.push(name_norm.clone());
            let sql = format!(
                "SELECT id, confidence FROM memory_entities
                 WHERE profile_id = ?{p_profile} AND {filter_sql}
                   AND name_norm = ?{p_name} AND status = 'active'"
            );
            let mut stmt = conn.prepare(&sql)?;
            let mut rows = stmt.query(rusqlite::params_from_iter(binds.sql_values.iter()))?;
            match rows.next()? {
                Some(row) => Some((row.get(0)?, row.get(1)?)),
                None => None,
            }
        };

        let id = existing
            .as_ref()
            .map(|(id, _)| id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        if let Some((_, old_confidence)) = existing {
            let new_confidence = confidence.max(old_confidence);
            conn.execute(
                "UPDATE memory_entities
                 SET confidence = ?1, description = COALESCE(?2, description),
                     updated_at = ?3, source_turn_id = COALESCE(?4, source_turn_id),
                     source_session_id = COALESCE(?5, source_session_id)
                 WHERE id = ?6",
                params![
                    new_confidence,
                    description,
                    now,
                    source_turn_id,
                    source_session_id,
                    id
                ],
            )?;
        } else {
            conn.execute(
                "INSERT INTO memory_entities
                 (id, profile_id, project_id, type, subtype, name, name_norm,
                  description, created_at, updated_at, confidence,
                  source_turn_id, source_session_id, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11, ?12, 'active')",
                params![
                    id,
                    profile_id,
                    project_id,
                    entity_type,
                    subtype,
                    name,
                    name_norm,
                    description,
                    now,
                    confidence,
                    source_turn_id,
                    source_session_id
                ],
            )?;
        }
        self.memory_entity_get(&id)?
            .ok_or_else(|| crate::db::anyhow!("memory entity {id} vanished after upsert"))
    }

    pub fn memory_entity_get(&self, id: &str) -> Result<Option<MemoryEntityRecord>> {
        let conn = self.conn();
        conn.query_row(
            "SELECT id, profile_id, project_id, type, subtype, name, description,
                    confidence, status, created_at, updated_at
             FROM memory_entities WHERE id = ?1",
            params![id],
            |row| {
                Ok(MemoryEntityRecord {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    project_id: row.get(2)?,
                    entity_type: row.get(3)?,
                    subtype: row.get(4)?,
                    name: row.get(5)?,
                    description: row.get(6)?,
                    confidence: row.get(7)?,
                    status: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other.into()),
        })
    }

    /// Record a mention (provenance) for an entity.
    #[allow(clippy::too_many_arguments)]
    pub fn memory_mention_add(
        &self,
        entity_id: &str,
        session_id: Option<&str>,
        turn_id: Option<&str>,
        text_span: &str,
        span_start: i64,
        span_end: i64,
        confidence: f64,
    ) -> Result<MemoryMentionRecord> {
        let now = now_ms();
        let id = Uuid::new_v4().to_string();
        self.conn().execute(
            "INSERT INTO memory_mentions
             (id, entity_id, session_id, turn_id, text_span, span_start, span_end,
              confidence, occurred_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id, entity_id, session_id, turn_id, text_span, span_start, span_end, confidence,
                now
            ],
        )?;
        Ok(MemoryMentionRecord {
            id,
            entity_id: entity_id.to_string(),
            session_id: session_id.map(String::from),
            turn_id: turn_id.map(String::from),
            text_span: text_span.to_string(),
            span_start,
            span_end,
            confidence,
            occurred_at: now,
        })
    }

    /// Add a fact. If an active fact with the same subject and predicate
    /// exists, it is superseded (correction), keeping history.
    #[allow(clippy::too_many_arguments)]
    pub fn memory_fact_upsert(
        &self,
        profile_id: &str,
        scope: MemoryScope,
        project_id: Option<i64>,
        subject_entity_id: Option<&str>,
        predicate: &str,
        object_text: &str,
        object_entity_id: Option<&str>,
        confidence: f64,
        source_mention_id: Option<&str>,
    ) -> Result<MemoryFactRecord> {
        let (filter, filter_arg) = self.memory_scope_guard(scope, project_id)?;
        let now = now_ms();
        let id = Uuid::new_v4().to_string();
        let conn = self.conn();

        let previous: Option<String> = {
            let mut binds = Binds::new();
            let p_profile = binds.push(profile_id);
            let filter_sql = match filter_arg {
                Some(_) => {
                    let p = binds.push(filter_arg.unwrap_or(-1).to_string());
                    format!("project_id = ?{p}")
                }
                None => filter.clone(),
            };
            let (subject_sql, subject_bind): (String, Option<usize>) = match subject_entity_id {
                Some(subject) => {
                    let p = binds.push(subject);
                    ("subject_entity_id = ?".to_string(), Some(p))
                }
                None => ("subject_entity_id IS NULL".to_string(), None),
            };
            let p_predicate = binds.push(predicate);
            let sql = format!(
                "SELECT id FROM memory_facts
                 WHERE profile_id = ?{p_profile} AND {filter_sql} AND {subject_sql}
                   AND predicate = ?{p_predicate} AND status = 'active'"
            );
            let _ = subject_bind;
            let mut stmt = conn.prepare(&sql)?;
            let mut rows = stmt.query(rusqlite::params_from_iter(binds.sql_values.iter()))?;
            match rows.next()? {
                Some(row) => Some(row.get(0)?),
                None => None,
            }
        };

        conn.execute(
            "INSERT INTO memory_facts
             (id, profile_id, project_id, subject_entity_id, predicate, object_text,
              object_entity_id, confidence, status, created_at, source_mention_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, ?10)",
            params![
                id,
                profile_id,
                project_id,
                subject_entity_id,
                predicate,
                object_text,
                object_entity_id,
                confidence,
                now,
                source_mention_id
            ],
        )?;
        if let Some(previous_id) = previous {
            conn.execute(
                "UPDATE memory_facts SET status = 'superseded', superseded_by = ?1
                 WHERE id = ?2",
                params![id, previous_id],
            )?;
        }
        Ok(MemoryFactRecord {
            id,
            subject_entity_id: subject_entity_id.map(String::from),
            predicate: predicate.to_string(),
            object_text: object_text.to_string(),
            object_entity_id: object_entity_id.map(String::from),
            confidence,
            status: "active".to_string(),
            created_at: now,
            superseded_by: None,
        })
    }

    /// Add or refresh a typed relation between two entities.
    pub fn memory_edge_upsert(
        &self,
        entity_id: &str,
        relation: &str,
        target_entity_id: &str,
        confidence: f64,
        first_seen_turn_id: Option<&str>,
    ) -> Result<()> {
        let now = now_ms();
        self.conn().execute(
            "INSERT INTO memory_edges
             (entity_id, relation, target_entity_id, confidence, first_seen_turn_id, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT (entity_id, relation, target_entity_id) DO UPDATE SET
               confidence = MAX(confidence, excluded.confidence),
               last_seen_at = excluded.last_seen_at",
            params![
                entity_id,
                relation,
                target_entity_id,
                confidence,
                first_seen_turn_id,
                now
            ],
        )?;
        Ok(())
    }

    /// List entities within one scope, optionally filtered by type or a
    /// name-substring query (the FTS search is `memory_search`).
    pub fn memory_entities_list(
        &self,
        profile_id: &str,
        scope: MemoryScope,
        project_id: Option<i64>,
        entity_type: Option<&str>,
        query: Option<&str>,
        limit: i64,
    ) -> Result<Vec<MemoryEntityRecord>> {
        let (filter, filter_arg) = self.memory_scope_guard(scope, project_id)?;
        let mut binds = Binds::new();
        let p_profile = binds.push(profile_id);
        let filter_sql = match filter_arg {
            Some(_) => {
                let p = binds.push(filter_arg.unwrap_or(-1).to_string());
                format!("project_id = ?{p}")
            }
            None => filter,
        };
        let mut clauses = vec![format!("profile_id = ?{p_profile}"), filter_sql];
        if let Some(t) = entity_type {
            let p = binds.push(t);
            clauses.push(format!("type = ?{p}"));
        }
        if let Some(q) = query {
            let p = binds.push(format!("%{}%", normalize_name(q)));
            clauses.push(format!("name_norm LIKE ?{p} ESCAPE '\\'"));
        }
        let sql = format!(
            "SELECT id, profile_id, project_id, type, subtype, name, description,
                    confidence, status, created_at, updated_at
             FROM memory_entities
             WHERE {} AND status = 'active'
             ORDER BY updated_at DESC LIMIT {limit}",
            clauses.join(" AND ")
        );
        let conn = self.conn();
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query(rusqlite::params_from_iter(binds.sql_values.iter()))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(MemoryEntityRecord {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                project_id: row.get(2)?,
                entity_type: row.get(3)?,
                subtype: row.get(4)?,
                name: row.get(5)?,
                description: row.get(6)?,
                confidence: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            });
        }
        Ok(out)
    }

    /// Full-text search over entity names and descriptions (FTS5).
    pub fn memory_search(
        &self,
        profile_id: &str,
        scope: MemoryScope,
        project_id: Option<i64>,
        text: &str,
        limit: i64,
    ) -> Result<Vec<MemoryEntityRecord>> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }
        // FTS5 MATCH input is untrusted: quote it as a literal phrase to
        // avoid syntax errors and injection through operators.
        let phrase = format!("\"{}\"", trimmed.replace('"', "\"\""));
        let (filter, filter_arg) = self.memory_scope_guard(scope, project_id)?;
        let mut binds = Binds::new();
        let p_profile = binds.push(profile_id);
        let filter_sql = match filter_arg {
            Some(_) => {
                let p = binds.push(filter_arg.unwrap_or(-1).to_string());
                format!("project_id = ?{p}")
            }
            None => filter,
        };
        let p_phrase = binds.push(phrase);
        let sql = format!(
            "SELECT e.id, e.profile_id, e.project_id, e.type, e.subtype, e.name,
                    e.description, e.confidence, e.status, e.created_at, e.updated_at
             FROM memory_fts f
             JOIN memory_entities e ON e.rowid = f.rowid
             WHERE e.profile_id = ?{p_profile} AND e.{filter_sql}
               AND e.status = 'active' AND memory_fts MATCH ?{p_phrase}
             ORDER BY rank LIMIT {limit}"
        );
        let conn = self.conn();
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query(rusqlite::params_from_iter(binds.sql_values.iter()))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(MemoryEntityRecord {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                project_id: row.get(2)?,
                entity_type: row.get(3)?,
                subtype: row.get(4)?,
                name: row.get(5)?,
                description: row.get(6)?,
                confidence: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            });
        }
        Ok(out)
    }

    /// Delete an entity and its derived rows (mentions, facts, edges via
    /// FK cascade; the FTS trigger removes the index entry).
    pub fn memory_entity_remove(&self, id: &str) -> Result<()> {
        let n = self.conn().execute(
            "DELETE FROM memory_entities WHERE id = ?1 AND status = 'active'",
            params![id],
        )?;
        if n == 0 {
            return Err(crate::db::anyhow!(
                "memory entity {id} not found or not active"
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn db() -> (Database, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let database = Database::open(&dir.path().join("t.db")).expect("open db");
        (database, dir)
    }

    #[test]
    fn upsert_dedups_by_name_norm_within_scope() {
        let (database, _dir) = db();
        let first = database
            .memory_entity_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                "person",
                None,
                "Alice Smith",
                None,
                0.6,
                None,
                None,
            )
            .expect("first upsert");
        let second = database
            .memory_entity_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                "person",
                None,
                "  ALICE SMITH  ",
                Some("Software Architect"),
                0.9,
                None,
                None,
            )
            .expect("second upsert");
        assert_eq!(first.id, second.id, "exact name_norm collision must merge");
        assert_eq!(second.confidence, 0.9, "higher confidence wins");
        assert_eq!(
            second.description.as_deref(),
            Some("Software Architect"),
            "new description fills the empty field"
        );
        let listed = database
            .memory_entities_list("p1", MemoryScope::Profile, None, None, None, 50)
            .expect("list");
        assert_eq!(listed.len(), 1);
    }

    #[test]
    fn profile_and_project_scopes_do_not_leak() {
        let (database, _dir) = db();
        database
            .memory_entity_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                "technology",
                None,
                "9Router",
                None,
                0.5,
                None,
                None,
            )
            .expect("profile entity");
        database
            .conn()
            .execute(
                "INSERT INTO projects (id, path, name, pinned, created_at, last_opened_at)
                 VALUES (7, 'C:/proj', 'proj', 0, 0, 0)",
                [],
            )
            .expect("seed project row");
        database
            .memory_entity_upsert(
                "p1",
                MemoryScope::Project,
                Some(7),
                "technology",
                None,
                "9Router",
                None,
                0.5,
                None,
                None,
            )
            .expect("project entity");
        let profile_rows = database
            .memory_entities_list("p1", MemoryScope::Profile, None, None, None, 50)
            .expect("profile list");
        let project_rows = database
            .memory_entities_list("p1", MemoryScope::Project, Some(7), None, None, 50)
            .expect("project list");
        assert_eq!(profile_rows.len(), 1);
        assert!(profile_rows[0].project_id.is_none());
        assert_eq!(project_rows.len(), 1);
        assert_eq!(project_rows[0].project_id, Some(7));
    }

    #[test]
    fn other_profile_never_sees_entities() {
        let (database, _dir) = db();
        database
            .memory_entity_upsert(
                "profile-a",
                MemoryScope::Profile,
                None,
                "person",
                None,
                "Bob",
                None,
                0.5,
                None,
                None,
            )
            .expect("seed");
        let rows = database
            .memory_entities_list("profile-b", MemoryScope::Profile, None, None, None, 50)
            .expect("list other profile");
        assert!(rows.is_empty(), "profile-b must not see profile-a rows");
    }

    #[test]
    fn fact_correction_supersedes_instead_of_overwriting() {
        let (database, _dir) = db();
        let person = database
            .memory_entity_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                "person",
                None,
                "Carol",
                None,
                0.8,
                None,
                None,
            )
            .expect("entity");
        let first = database
            .memory_fact_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                Some(&person.id),
                "lives_in",
                "Berlin",
                None,
                0.7,
                None,
            )
            .expect("first fact");
        let second = database
            .memory_fact_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                Some(&person.id),
                "lives_in",
                "Munich",
                None,
                0.9,
                None,
            )
            .expect("corrected fact");
        assert_ne!(first.id, second.id);
        let status: (String, Option<String>) = database
            .conn()
            .query_row(
                "SELECT status, superseded_by FROM memory_facts WHERE id = ?1",
                params![first.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("old fact row");
        assert_eq!(status.0, "superseded");
        assert_eq!(status.1, Some(second.id));
        let active: i64 = database
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM memory_facts WHERE subject_entity_id = ?1 AND status = 'active'",
                params![person.id],
                |row| row.get(0),
            )
            .expect("count active");
        assert_eq!(active, 1, "only the corrected fact stays active");
    }

    #[test]
    fn search_finds_entity_by_fts_and_scopes_results() {
        let (database, _dir) = db();
        database
            .memory_entity_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                "technology",
                None,
                "ZRouter gateway",
                Some("9Router endpoint at zrouter.itms.com.br"),
                0.9,
                None,
                None,
            )
            .expect("seed");
        let hits = database
            .memory_search("p1", MemoryScope::Profile, None, "gateway", 10)
            .expect("search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "ZRouter gateway");
        let miss = database
            .memory_search("p2", MemoryScope::Profile, None, "gateway", 10)
            .expect("search other profile");
        assert!(miss.is_empty());
    }

    #[test]
    fn remove_cascades_mentions_facts_edges() {
        let (database, _dir) = db();
        let a = database
            .memory_entity_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                "person",
                None,
                "Dave",
                None,
                0.9,
                None,
                None,
            )
            .expect("a");
        let b = database
            .memory_entity_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                "organization",
                None,
                "Acme Corp",
                None,
                0.9,
                None,
                None,
            )
            .expect("b");
        database
            .memory_mention_add(&a.id, Some("s1"), Some("t1"), "Dave", 0, 4, 0.9)
            .expect("mention");
        database
            .memory_fact_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                Some(&a.id),
                "works_at",
                "Acme Corp",
                Some(&b.id),
                0.9,
                None,
            )
            .expect("fact");
        database
            .memory_edge_upsert(&a.id, "works_at", &b.id, 0.9, Some("t1"))
            .expect("edge");
        database.memory_entity_remove(&a.id).expect("remove");
        let counts: (i64, i64, i64) = database
            .conn()
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM memory_mentions WHERE entity_id = ?1),
                   (SELECT COUNT(*) FROM memory_facts WHERE subject_entity_id = ?1),
                   (SELECT COUNT(*) FROM memory_edges WHERE entity_id = ?1)",
                params![a.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("counts");
        assert_eq!(counts, (0, 0, 0), "derived rows must cascade");
    }

    #[test]
    fn mention_keeps_provenance_fields() {
        let (database, _dir) = db();
        let e = database
            .memory_entity_upsert(
                "p1",
                MemoryScope::Profile,
                None,
                "person",
                None,
                "EVE",
                None,
                0.9,
                None,
                None,
            )
            .expect("entity");
        let m = database
            .memory_mention_add(&e.id, Some("sess-1"), Some("turn-9"), "EVE", 3, 6, 0.95)
            .expect("mention");
        assert_eq!(m.session_id.as_deref(), Some("sess-1"));
        assert_eq!(m.turn_id.as_deref(), Some("turn-9"));
        assert_eq!((m.span_start, m.span_end), (3, 6));
    }
}
