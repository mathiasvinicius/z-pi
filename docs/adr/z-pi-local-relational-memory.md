# Local Relational Memory in host-core (Z-PI P2.1)

- Status: Accepted for implementation
- Date: 2026-09-29
- Scope: Z-PI fork; amends ADR 0234 (project memory stays host-owned and path-scoped) without changing its contract
- Related: requerimentos.md P2.1; ADR 0011 (frozen storage ownership); ADR 0014 (host-owned schema); ADR 0234; checklist.md Phase 2

## Context

Z-PI needs durable, profile-scoped relational memory: entities, facts,
relationships, provenance, confidence, timestamps, correction/deletion, and
cross-session retrieval. The user asked for "local semantic memory similar to
Neo4j with the GLiNER2 engine", by way of the neo4j-labs/agent-memory
architecture (POLE+O entities, relation extraction, `SAME_AS` deduplication,
multi-stage extraction).

The product constraint is absolute (requerimentos.md, P1 principles):
delivered Windows builds require no separately installed Node.js, Python,
Docker, Neo4j, or database service. Neo4j's server and neo4j-labs/agent-memory
are reference architectures, not runtime dependencies.

`neo4j-labs/agent-memory`'s useful ideas are: POLE+O-style typed entities,
multi-stage extraction (fast heuristic stage plus fallback), automatic merge
above a similarity threshold with `SAME_AS` review below it, and vector plus
graph search. All of these can be modeled in SQLite tables with explicit edge
rows plus FTS5; no second engine is required.

## Measured feasibility spike (2026-09-29, this machine, Windows x64, CPU)

Measured with Python 3.11.15, `gliner` 0.2.29 + `gliner2` 2.0.0,
`torch` CPU, Portuguese text (3 samples), POLE+O-style labels, on the
developer notebook (Intel Raptor Lake i9-class CPU, AMD64):

| Metric | gliner-community/gliner_small-v2.5 (classic loader) | fastino/gliner2-multi-v1 |
|---|---|---|
| Cold start (load) | 2.09 s | 111.78 s (download + load) |
| First batch (3 texts) | 0.24 s | not reached — API rejected `labels=` kwarg |
| Warm batch (3 texts) | 0.12 s | not measured |
| Peak RSS | 1,730 MB | ~1.9 GB while loading |
| Settled RSS after extract | 1,182 MB | — |
| Entities found (3 texts) | 23 | — |
| Runtime packaging cost | venv with torch: 863 MB, Python required | same, plus schema runtime |

The gliner-community checkpoints publish `gliner_config.json`; the GLiNER2
2.0.0 loader expects `config.json` and fails on them. The two packages also
have incompatible inference APIs (`batch_predict_entities` deprecated in the
classic package, `extract_entities(labels=...)` rejected in the new one).
Licenses: gliner is Apache-2.0; gliner2 and torch ship no machine-readable
license in the installed metadata and require manual verification before
shipping.

Interpretation: even the smallest GLiNER variant needs a bundled Python +
torch runtime (863 MB venv measured, >1 GB RAM resident). That contradicts
the zero-install requirement and adds a fragile dual-format model ecosystem.
The GLiNER2 pip package itself is not production-ready for Windows bundling
today (incompatible loaders, missing deps like `peft` not declared,
non-deterministic HF Hub downloads).

## Decision

1. Implement relational memory natively in the Rust host-core SQLite
   database (the only persistence owner, per ADR 0011/0014). New tables,
   additive migration to schema v21, no second engine, no Python.
2. Data model (POLE+O-inspired, SQLite):
   - `memory_entities(id, profile_id, project_id NULL, type, subtype,
     name, name_norm, description, created_at, updated_at,
     confidence, source_turn_id, source_session_id, status)` —
     `name_norm` lowercase UNIQUE per (scope, type) for exact dedup;
     `status` ∈ `active|merged|deleted`; profile-wide memories have
     `project_id NULL`, project memories are always scoped.
   - `memory_mentions(entity_id, session_id, turn_id, text_span,
     span_start, span_end, confidence, occurred_at)` — provenance of
     every assertion, never the model's summary alone.
   - `memory_facts(id, scope, project_id, subject_entity_id,
     predicate, object_text, object_entity_id NULL, confidence,
     status, created_at, source_mention_id, superseded_by)` —
     correction = supersede + tombstone, never in-place overwrite.
   - `memory_edges(entity_id, relation, target_entity_id, confidence,
     first_seen_turn_id, last_seen_at)` — explicit graph edges
     (SQLite does not need a graph server for one-hop joins).
   - `SAME_AS` is modeled as `memory_edges(relation='same_as')` with the
     merged survivor chosen by degree (mirrors the neo4j-labs approach).
   - FTS5 virtual table over entity name+description and fact text for
     full-text retrieval; explicit `LIKE`/normalized lookup remains for
     exact dedup. Vector search is explicitly out of scope for v1
     (SQLite vec/FTS5+embedding can be added later behind the same RPC).
3. Extraction runs in two stages, both inside the existing boundaries:
   - Stage 1 (always available, offline): a native Rust heuristic
     extractor in host-core (capitalization, punctuation, stopword and
     numeric filters, POLE+O type classification from a small curated
     label list). Zero external dependencies. This is the guaranteed
     floor that keeps memory working with no provider configured.
   - Stage 2 (optional, better quality): the session's configured
     provider performs the extraction through the existing agent
     tool-call boundary — a bounded JSON-schema tool `memory.extract`
     exposed to the agent, so extraction quality follows the configured
     model (ZRouter or any other) and never requires a bundled ML
     runtime. The model is untrusted at this boundary: its output is
     schema-validated, size-bounded, and entity/fact rows record
     `confidence` and `source_*` provenance, so a hallucinated entity is
     visible and correctable, never silently authoritative.
4. Deduplication: exact `name_norm` collision auto-merges (survivor by
   higher mention count), similarity review below threshold is left to
   the user through the memory surface (no silent fuzzy merge in v1).
   `SAME_AS` edges are retained for review, mirroring agent-memory's
   `flag_threshold` behavior.
5. Scoping and privacy: every table carries `profile_id` (the portable
   root's profile) and optional `project_id`. Cross-profile leakage is
   impossible by construction: the database file itself lives under the
   profile root (P1.3), and all queries filter on `profile_id` and
   `project_id`. Retention controls: per-scope disable and per-row delete
   are first-class RPC methods; deleting an entity cascades to its
   mentions, facts, and edges.
6. RPC surface (host-owned, additive; names follow the existing
   `skills.*`/`mcp.*` convention):
   - `memory.entities.list({ scope, projectPath?, type?, query? })`
   - `memory.entities.create/update/remove`
   - `memory.facts.add/list/correct/remove`
   - `memory.edges.list`
   - `memory.search({ scope, projectPath?, text, limit? })` (FTS5)
   - `memory.extract.tool` registered as an agent tool (stage 2)
   - `memory.settings({ enabled, scope })`
6.1. Electron main stays a thin orchestrator: it forwards the memory
   RPC methods to host-core over the existing stdio JSON-RPC bridge and
   exposes one preload bridge; no memory logic in the renderer or main.
7. GLiNER2 is rejected as a **bundled dependency** on these measurements.
   It remains a future option only if repackaged as a small ONNX
   sidecar with a measured, acceptable footprint (record: today it
   requires 863 MB Python/torch and >1 GB RAM).
8. `pi-supermemory` remains out: this design supersedes it for local
   relational memory (checklist item "Reassess pi-supermemory" resolved
   by this ADR).

## Consequences

- Memory works fully offline with no provider, at heuristic quality;
  quality upgrades come from the configured model at no packaging cost.
- The schema migration is additive (v20 → v21); existing profiles gain
  empty memory tables on upgrade; no existing data is touched.
- Two-instance (two portable roots) isolation inherits the per-profile
  database file placement already implemented in P1.3.
- Hallucinated entities from provider extraction are bounded by schema
  validation, confidence, provenance, and user deletion/correction.
- GLiNER2-class local ML extraction stays out until an ONNX-runtime
  sidecar can be measured under ~150 MB with sub-second warm latency.

## Alternatives considered

- **Neo4j embedded / server**: violates zero-install; rejected.
- **neo4j-labs/agent-memory as a bundled Python package**: measured
  863 MB + >1 GB RAM; violates zero-install; rejected.
- **SQLite + sqlite-vec only (vectors, no relations)**: loses the
  relational/provenance model the user explicitly asked for; rejected.
- **LLM-only extraction, no stage-1 extractor**: loses the offline
  floor and makes memory dependent on a configured provider; rejected.
- **ONNX GLiNER sidecar today**: no maintained ONNX export of
  gliner2-multi-v1 exists at decision time; revisit per clause 7.