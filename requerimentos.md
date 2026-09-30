# Z-PI requirements and implementation roadmap

Status: planning. Target: Windows x64 first. This document describes intended
behavior, not features already implemented in this fork. Product contracts and
architecture changes must later be reflected in the relevant `docs/spec/` files
and ADRs alongside each implementation.

Progress and validation evidence are tracked in `checklist.md`; update that
checklist in the same change whenever implementation or verification status
changes.
For upcoming slices, the primary agent designs and reviews boundaries while
smaller subagents implement independent, scoped work; the primary agent owns
integration tests and checklist status.

Implementation tracker (2026-09-29): the first code slices add profile-root
resolution for Windows portable builds, profile-local global instructions,
pt-BR defaults for new profiles, Z-PI Windows naming, and the fork's update
feed. The portable profile now receives the Windows hidden attribute. Semantic
skills are native in host-core (P1.2): `SemanticSkillFind`, `SemanticSkillRead`,
and `SemanticSkillLearn` search installed and legacy skills by intent, load
instructions on demand, check session project scope, and reject secret leaks.
The bundled plugin is retired, while existing profile libraries remain readable
in place. Alt+Space is unbound by default on Windows.
unbound by default on Windows. The ZRouter endpoint is a native preset, and a
genuinely fresh database now opens its preselected setup form without creating
a provider or copying a credential. Its first automatically suggested model
receives the editable `ZROUTER` alias; authenticated discovery and supported
reasoning-level handling still require validation. Phase 2 local relational
memory passed its feasibility gate: ADR `z-pi-local-relational-memory` was
accepted with measured Windows CPU numbers (GLiNER2 rejected as a bundled
dependency; 863 MB venv, >1 GB RAM). Schema v21, host-core storage, and the
agent-facing `MemorySearch` and `MemoryRecord` tools are implemented and tested
across sessions. The baseline `native-pi-session.test.ts` Windows-path failure
was corrected with `basename()`. `--install`, automatic portable executable
replacement, completed credential/tool integration, automatic post-turn
extraction, and renderer memory controls remain open.
The latest unsigned portable is at
`apps/desktop/release/review-20260929-final-clean/Z-PI-Portable-0.15.10.exe`;
it was rechecked in a clean folder: the Z-PI title and plugin load are correct,
and update discovery reached GitHub without the `app-update.yml` warning.
The fork currently has no published release.
Two concurrent copies from different temporary folders opened independent
windows and profile roots; a repeat launch from one folder did not create a
third instance. Cross-profile content/credential isolation still needs a
deeper functional test.
The newer semantic-visibility and ZRouter first-run source slices passed
focused desktop and Rust tests but have not yet been repackaged or exercised
end to end.
Two package attempts stopped at an electron-builder Windows `EPERM` rename
during Electron extraction; a fresh temporary output path succeeded. The
incomplete outputs remain isolated under ignored `apps/desktop/release/` for
diagnosis.
Neither the full onboarding flow nor automatic update is validated. The existing portable target still
extracts its bundled application to a temporary directory; only profile state
has been moved beside the executable so far. See
`docs/spec/09-z-pi/01-windows-foundation.md`.

## Product and delivery principles

- Z-PI is a maintained fork of PI-Desktop, not a wrapper around an upstream
  executable. Preserve the existing Renderer → preload IPC → Electron Main →
  Rust host-core / bundled pi Agent runtime boundaries.
- Ship a self-contained Windows portable executable/distribution. Users must
  not install Node.js, Python, Docker, Neo4j, or a database service. Electron's
  bundled JavaScript/Node runtime remains an internal implementation detail;
  removing it would be a separate architectural project, not this requirement.
- Keep profile data, credentials, skills, knowledge sources, and memory local
  to the selected installation/profile unless a user explicitly exports them.
  Never publish personal data or API keys to GitHub.
- Keep fork-specific behavior in focused modules, configuration, tests, specs,
  and ADRs. Avoid patching built `app.asar` files or maintaining a second
  production launcher. Treat PI-PKGS as a source of reviewed migration inputs,
  not as an automatic authority over local profiles.
- Bring upstream changes in through a tracked `upstream` Git remote and
  reviewed merges/rebases into the fork. Build, test, and publish Z-PI releases
  from this repository. Installed Z-PI builds must discover, download, and
  apply application updates only from `mathiasvinicius/z-pi`, never from the
  upstream PI-Desktop feed. Make the release channel and artifact naming
  explicit, and verify integrity and rollback behavior.

## Phase 1 — Windows foundation

### P1.1 Native pt-BR

The fork already includes a `pt-BR` catalog in `packages/i18n`; that is the
starting point, not proof that every surface is translated. Set pt-BR as the
default for **new Z-PI profiles** while preserving an existing user's explicit
language choice. Audit renderer, native menus/dialogs, updater, onboarding,
plugin surfaces, errors, accessibility labels, and bundled extensions for
untranslated or misleading strings. Keep English as the source catalog if
needed for upstream compatibility. Add catalog parity and user-path tests.

Acceptance: a fresh Windows profile opens in Portuguese without an external
translation overlay; language can still be changed; common flows contain no
unintentional English; upgrades do not reset an explicit preference.

### P1.2 Native per-profile semantic skills

Port the current semantic-skills behavior from PI-PKGS into the fork's existing
skill/agent/plugin architecture. One resolver should select relevant skills
from the user's intent and load only the selected instructions at use time;
normal startup must not also inject the entire skill library. Imported,
downloaded, and newly created skills become discoverable automatically in
the owning profile, without a central personal-skills index or cross-profile
copying. Preserve global-within-profile versus project scope.

Skill creation and improvement need provenance, stable identity, similarity
checks, a proposed revision to an existing skill when appropriate, versioned
history/rollback, and user review before changing a user-authored procedure.
Never silently replace a locally edited skill with PI-PKGS content. Keep
untrusted skill text inside current permission and prompt-injection boundaries.

Acceptance: a request finds the appropriate local skill, unrelated skills are
not sent to the model, a downloaded skill is available without restarting or
manual indexing, and a better procedure updates the right skill instead of
creating a duplicate. Two executable folders retain different libraries.

### P1.3 Portable profile and optional `--install`

Default launch derives the installation root from the **executable's actual
directory**, not the shell working directory. Place the bundled app/runtime
and profile state under that root, e.g. `<root>/app` and
`<root>/.pi-desktop`; retain the current portable convention of hiding these
folders on Windows. The global agent instruction file for this Z-PI profile
is `<root>/.pi-desktop/agent/AGENTS.md`, not
`%USERPROFILE%/.pi/agent/AGENTS.md`. Project-local `AGENTS.md` files remain
project-scoped and are not relocated into the profile.

`Z-PI.exe --install` provisions the same self-contained distribution at
`%ProgramData%/ITMS/Z-PI` and launches/ registers that installation. Define
upfront how non-admin users obtain write access to the profile directory;
request elevation only for installation/ACL setup, not for ordinary use.
Do not silently fall back to a home-directory profile when the selected root
is unwritable. Define explicit migration/import for existing `.pi-desktop`
profiles and make it non-destructive. One executable root admits one running
instance; different roots may run simultaneously as separate profiles.

Acceptance: copying `Z-PI.exe` into a new writable folder creates an isolated
profile there; launch works regardless of current directory; `--install`
works from a standard Windows environment; the app finds its own AGENTS,
skills, database, secrets, logs, and plugins; two distinct roots do not share
state; a second launch from one root activates the existing instance.

### P1.4 ZRouter first-run provider

For a new profile, preconfigure the ZRouter provider endpoint
`https://zrouter.itms.com.br/v1` and guide the user through entering that
profile's API key on first use. Default model alias is `ZROUTER`, editable
later. Discover only models/capabilities allowed by the entered key; do not
assume a token's model identity or copy the EVE/Ariane credentials between
profiles. Preserve the user's provider and model changes on subsequent starts.
Use the existing encrypted secret-storage boundary; pass credentials to
approved ZRouter tools at execution time without exposing them to chat text,
logs, skill files, or the repository. Handle offline/invalid-key states clearly.

Acceptance: a new profile can authenticate and use its permitted chat, skills,
and other advertised ZRouter capabilities without re-entering the token for
each tool; an existing profile's provider choice is not overwritten; no API
key appears in the model's context or diagnostic output.

### P1.5 Fork releases and upstream maintenance

Rename Windows product metadata and release artifacts to Z-PI; configure the
existing Electron updater and portable path for this fork's GitHub Releases.
Publish Windows x64 artifacts with a repeatable build and release checklist.
Do not overwrite a running executable. Verify download integrity, stage an
update, provide rollback on failure, and preserve the profile unchanged.
Document the upstream sync procedure and keep fork-only patches reviewable.

Acceptance: an installed/portable Z-PI detects a newer **Z-PI** release,
applies it safely, retains its profile, and never offers an upstream
PI-Desktop release. A clean build needs development dependencies, but the
delivered app needs no separately installed runtime.

## Phase 2 — local intelligence and knowledge

### P2.1 Native local relational memory (feasibility gate first)

Design a profile-scoped memory model for entities, facts, relationships,
source provenance, confidence, timestamps, correction/deletion, and retrieval
across sessions. Project memories must remain scoped to their project; an
explicit profile-wide memory may be shared across projects. Keep retention
and opt-out controls. Store and query through Rust host-core, which already
owns SQLite; assess SQLite tables/FTS/vector support plus explicit graph edges
before adding another embedded engine.

Evaluate GLiNER2 as an **optional entity/relation extraction component**, not
as Neo4j itself or as a memory database. Neo4j's graph server and
`neo4j-labs/agent-memory` are references for graph and deduplication ideas,
not runtime dependencies. Prototype Portuguese extraction quality, model
size, CPU/RAM, Windows packaging, licensing, and offline behavior. If GLiNER2
requires a packaged Python/ML runtime that is too large or fragile, use a
smaller bundled extractor or the configured model through a bounded API;
never require the user to install Python or run a Neo4j/Docker service.

Acceptance gate passed: ADR `z-pi-local-relational-memory` compared options
with measured Windows footprint/latency (GLiNER2 rejected as a bundled
dependency; 863 MB venv, >1 GB RAM). Schema v21, host-core storage, and the
agent-facing `MemorySearch` and `MemoryRecord` tools are implemented and tested
across sessions. Final acceptance remaining: automatic post-turn extraction,
renderer memory controls, and verified retention/privacy end to end.

### P2.2 Speech with selectable Portuguese voices

Extend the existing speech/voice subsystem instead of creating a parallel
player. Offer a searchable voice list with pt-BR preferred, preview, selection,
play/pause/stop, and saving the generated audio. `edge-tts` is a Python client
for Microsoft's **online** Edge speech service; it is not an offline voice
model. Evaluate a bundled compatible adapter and service reliability, terms,
privacy, and failure handling. No separate Python install is acceptable; if
bundling an adapter is unsuitable, choose another supported speech backend.
Clearly label internet-dependent voices and provide an offline fallback only
if a genuinely local engine is packaged.

Acceptance: a user can choose and preview a pt-BR voice, generate/play/save
audio, and see a clear offline/service error without losing the conversation.

### P2.3 “Knowledge Source” surface and ingestion pipeline

Add a first-party **Knowledge Source** shortcut/panel through the existing
app command/panel pattern. Users can add files/URLs to a profile-wide library
or to a specific project, inspect sources, retry/cancel, and remove them.
Display real pipeline states such as queued, validating, extracting,
normalizing, splitting, indexing, ready, and failed; never display invented
progress. Preserve source attribution and access boundaries when retrieving
content for chat. Deduplicate by source identity/content hash, version changed
sources, and recover interrupted imports without duplicate work.

Review Open Notebook's ingestion and extraction approach for ideas, but do
not embed its Docker/SurrealDB service stack. Reuse existing Z-PI file,
network, permission, and host-core persistence boundaries. Any borrowed code
requires a license and dependency audit. Stage format support (text/Markdown,
PDF, web, then richer media) only after extraction quality and resource limits
are verified on Windows.

Acceptance: a file or URL can be imported at either scope, its actual stage
and errors are visible, cited passages are retrievable only where allowed,
and removing a source removes its derived index/memory entries.

## Implementation order and release gates

1. Record fork-specific architecture decisions for portable roots, profile
   isolation, update feed, and migration. Add regression tests around existing
   paths before changing them.
2. Land P1.3/P1.5 together enough to produce a safe self-contained Z-PI
   Windows build; then P1.1, P1.4, and P1.2 in reviewable slices.
3. Validate each slice with unit/contract tests, an isolated portable-profile
   boot, a separate `--install` test, two-profile concurrency, update/rollback,
   and preservation of an existing profile. Do not test with a user's live
   profile as the only evidence.
4. Run Phase 2 feasibility spikes before selecting engines or promising a
   release date. Follow the repo's spec, ADR, security, and E2E workflow for
   each accepted change.

## Current baseline and references

- The fork keeps upstream's Electron/React UI, Rust host-core persistence,
  and bundled pi Agent sidecar. New profiles now default to pt-BR, though the
  language audit and untranslated surfaces remain open.
- Portable-root behavior and profile-local agent instructions have an initial
  native implementation. The separate PI-PKGS launcher is migration input,
  not a runtime dependency. User data and profile-specific skills are not
  source assets to publish.
- The desktop publisher/update target now names `mathiasvinicius/z-pi`.
  Portable application replacement remains a separate unfinished feature.
- Upstream architecture: `docs/spec/02-architecture/01-architecture.md`;
  speech: `docs/spec/03-runtime/20-speech.md`; plugins:
  `docs/spec/07-plugins/`; release: `docs/spec/06-delivery/06-release-runbook.md`.
- External research: [GLiNER2](https://github.com/fastino-ai/GLiNER2),
  [Neo4j Agent Memory](https://github.com/neo4j-labs/agent-memory),
  [edge-tts](https://github.com/rany2/edge-tts), and
  [Open Notebook](https://github.com/lfnovo/open-notebook).
