# Z-PI implementation checklist

Last reviewed: 2026-09-29. Scope: Windows x64 first.

This is the progress ledger for `requerimentos.md`. Update it in the same
change whenever an item is implemented, tested, deferred, or found to need
more work. A checked box means the stated step is implemented or verified,
**not** that its whole section is ready for release. Do not mark a feature
complete solely because source code compiles or an artifact was packaged.

## Working method for upcoming slices

- The primary agent acts as architect: it defines interfaces, file ownership,
  safety constraints, acceptance tests, and review gates before delegation.
- Use smaller-capability subagents for bounded implementation or audits when
  the task is a good fit. Give each worker disjoint files and explicit tests;
  the primary agent reviews the diff and runs integration checks.
- Workers must preserve existing profile data and uncommitted changes. They
  must not commit, push, publish, replace a live executable, or mark their own
  work complete in this checklist. The architect updates this ledger after
  verification.

Delegated slices reviewed on 2026-09-29: directory-shaped semantic skill
discovery/tests (gpt-6-sol) and a bounded pt-BR catalog correction
(gpt-6-luna), followed by the window title, portable update-check guard, and
ZRouter preset, semantic visibility, fresh-profile marker/form, and first-model
alias (smaller-model workers). The architect reviewed their diffs;
packaged verification is still a separate gate.

## Repository and delivery baseline

- [x] Work in the user's fork checkout at `D:/Users/vinicius.mathias/Programação/_ITMS/z-pi`, not a second requirements repository.
- [x] Create `requerimentos.md`, the Z-PI Windows ADR, and mirrored foundation specs.
- [x] Configure `upstream` for fetching PI-Desktop changes; prevent accidental pushes to it.
- [x] Keep the fork's Windows name, product ID, release artifact name, and update feed pointed at `mathiasvinicius/z-pi`.
- [x] Build a local Windows portable prototype with Rust 1.98.1: `apps/desktop/release/Z-PI-Portable-0.15.10.exe` (unsigned, earlier snapshot).
- [x] Confirm the packaged resources contain the compiled host-core, bundled agent runtime, and semantic-skills plugin; confirm the packaged host-core hash matches the built binary.
- [x] Boot the updated portable prototype from a clean, writable folder: the Electron window, Rust host-core, agent sidecar, and bundled semantic plugin started. This is a startup smoke test, not validation of onboarding or a release.
- [x] Rebuild after the delegated skill/locale edits at `apps/desktop/release/review-20260929/Z-PI-Portable-0.15.10.exe`; confirm the bundled semantic plugin matches current source. This is still an unsigned prototype, not a release.
- [x] Repackage after title, updater, and ZRouter preset changes at `apps/desktop/release/review-20260929-final2/Z-PI-Portable-0.15.10.exe` (unsigned; SHA-256 `A49AC94CC1260C6B48E673887BAC290932F9F67FA4FD1E931B8D16E854724F0F`). Its clean startup was tested before the later cache-warning cleanup.
- [x] Build and clean-boot the newest unsigned prototype at `apps/desktop/release/review-20260929-final-clean/Z-PI-Portable-0.15.10.exe` (SHA-256 `132CA469C6BE1869D45D66467F50BFC66A5C46730A9B2D70C52B2F4069990045`). The Z-PI window and semantic plugin started; the updater reached GitHub with no `app-update.yml` warning. No published release exists yet.
- [x] Correct the renderer HTML title from `PI-Desktop` to `Z-PI` and add a branding regression test.
- [x] Recheck the window title in the refreshed portable's clean-folder launch: `Z-PI`.
- [ ] Review, commit, and push the currently uncommitted fork changes when explicitly requested; publish a Z-PI GitHub release only after release gates pass.
- [ ] Document and exercise a repeatable upstream sync, conflict review, build, and release procedure.
- [ ] Decide on code signing and verify the downloaded artifact's publisher/signature behavior on Windows.

## Phase 1.1 — Portuguese (pt-BR)

- [x] Default new profiles to pt-BR without overwriting an existing language selection; keep explicit OS-auto mode.
- [x] Correct `settings.skillBatchImported` to use the catalog's consistent Portuguese term “habilidades”; rerun i18n tests/typecheck.
- [ ] Audit and correct remaining English or misleading text in common renderer screens, native menus/dialogs, updater, onboarding, errors, accessibility labels, and bundled extensions.
- [ ] Test a clean Windows profile and an existing profile with a non-Portuguese selection in the packaged application.

## Phase 1.2 — semantic skills by profile

- [x] Bundle the semantic resolver as a first-party plugin; advertise one router skill and register find/read/learn tools.
- [x] Rescan the current profile's Markdown library on lookup so newly added files need no restart or manual index.
- [x] Discover one-level `<skill>/SKILL.md` packages as well as flat files in the profile library, with profile priority, normalized-ID deduplication, read-only handling, and tests for oversized/linked documents.
- [x] Prefer a locally authored skill on duplicate ID, keep source files in place, and refuse automatic modification of a non-plugin-owned or manually edited skill.
- [x] Keep learned files and their revision history inside the owning profile; unit-test two-profile isolation.
- [x] Verify the bundled semantic plugin loads and reaches ready state in a clean portable startup.
- [ ] Verify plugin permission grants, tool calls, and skill selection in the packaged app.
- [x] Apply one Electron-main visibility policy to startup, composer commands, and `Skill` suggestions: hide only global profile skills the active router can actually discover; keep project, external-root, linked, oversized, and unsupported native skills visible. Focused tests pass; packaged model-context validation remains pending.
- [ ] Integrate the plugin with the host-core native global/project skill catalog so startup advertises only the semantic router, not duplicate skill metadata; keep unrelated built-in skills available.
- [ ] Add project-scoped discovery and enforce project access boundaries for find/read/learn, including sessions in different projects.
- [ ] Complete file/package lifecycle for imported and downloaded skills, stable identity/provenance, and explicit conflict resolution without copying skills between profiles; discovery alone is not full lifecycle support.
- [ ] Require review of proposed revisions to user-authored procedures; verify deduplication, rollback, and prompt-injection/secret handling end to end.
- [ ] Confirm the private Ariane profile and its local skill edits are never overwritten by PI-PKGS or a bundled-plugin refresh.

## Phase 1.3 — portable profile and optional installation

- [x] Resolve a Windows portable profile from the original executable's folder, not the shell working directory or temporary extraction path.
- [x] Place Electron `userData`, logs, host state, and profile-local global `agent/AGENTS.md` under that `.pi-desktop` root; preserve project-local `AGENTS.md` resolution.
- [x] Give each executable folder its own single-instance lock; mark `.pi-desktop` hidden with a Windows attribute.
- [x] Boot-test two copied executables concurrently from separate temporary folders: two Z-PI windows used distinct profile roots; a repeated launch from one folder exited without a third window/profile. All identified test processes were stopped.
- [ ] Exercise actual data/credential/skill isolation across the two running profiles; distinct profile paths alone do not prove every data boundary.
- [ ] Decide whether to replace electron-builder's temporary app extraction with a verified `<exe-folder>/app` layout; hide only an `app` folder Z-PI actually creates.
- [ ] Implement `Z-PI.exe --install` at `%ProgramData%/ITMS/Z-PI`, including elevation for setup, per-user credential ACLs, ordinary unelevated use, and a non-destructive upgrade path.
- [ ] Define optional, explicit import from older `.pi-desktop` profiles; never copy EVE/Ariane credentials or skills between profiles automatically.
- [ ] Test missing/unwritable folders and permission failures without silently falling back to a different profile.

## Phase 1.4 — ZRouter first run

- [x] Add a native ZRouter provider preset with `https://zrouter.itms.com.br/v1`, OpenAI-compatible chat format, localized catalog label, and matching tests. This does not create a provider in a new profile.
- [x] Mark only a genuinely fresh database for ZRouter setup; open the preselected endpoint form once per renderer run when no provider exists. Existing/legacy databases receive no marker, and provider creation completes it. Host and renderer tests pass; packaged UI validation remains pending.
- [ ] Verify the fresh-profile ZRouter form and preservation of existing provider choices in a packaged app.
- [ ] Ask for that profile's API key on first use, validate it, and store it through the existing encrypted secret boundary; never place it in chat, skill files, logs, or Git.
- [x] Default only the first automatically recommended ZRouter model alias to editable `ZROUTER`, without overwriting a user edit or applying that alias to other providers. Source tests pass; packaged UI validation remains pending.
- [ ] Discover only the models/capabilities allowed by that key and expose supported reasoning levels; verify authenticated discovery in a packaged profile.
- [ ] Make approved ZRouter tools (chat, memory, image/video, speech, embeddings, web, skills) authenticate automatically at execution time without asking the model or user to paste the key into a conversation.
- [ ] Test invalid-key, offline, rotation, and multi-profile scenarios, including EVE and Ariane isolation.

## Phase 1.5 — releases and shortcuts

- [x] Disable the Alt+Space plugin-launcher binding by default on Windows while permitting an explicit user-selected binding.
- [x] Point Z-PI update discovery at the fork and keep the existing NSIS installer from replacing a portable copy.
- [x] Configure an explicit fork GitHub feed for manual update checks, avoiding the absent portable `resources/app-update.yml`; prevent stored automatic preferences from invoking NSIS in portable/ZIP builds. Focused policy/source tests passed.
- [x] Recheck the refreshed portable: the check reached GitHub, which returned `No published versions on GitHub` because the fork has no release yet. The remaining missing-file warning came only from installer-cache maintenance, not the feed check.
- [x] Skip NSIS installer-cache maintenance for manual-only builds; targeted tests/typecheck and the latest clean packaged smoke confirmed the missing-file warning is gone.
- [x] Repackage after two `EPERM` failures in the repository build directory by using a fresh temporary output path; the successful output was moved under ignored `apps/desktop/release/`. Incomplete failed outputs remain there for diagnosis, not as release artifacts.
- [ ] Publish a test release and verify discovery of a newer version; manual discovery is not portable executable replacement.
- [ ] Implement portable self-update: discover the newest **Z-PI** release, download the correct artifact, verify integrity, stage it, replace only after process exit, and roll back on failure while preserving `.pi-desktop`.
- [ ] Test update and rollback from an older portable version, including a running executable and independent profile folders.
- [ ] Publish a tested Windows x64 release and verify installed copies never use `vastsa/PI-Desktop` as their update source.

## Phase 2 — local intelligence and knowledge

- [x] ADR `z-pi-local-relational-memory` accepted: SQLite/FTS5 relational model in host-core with explicit graph edges, two-stage extraction (native heuristic floor + provider-backed `memory.extract`), profile/project scoping, and provenance. Measured GLiNER2 on Windows CPU before deciding: smallest `gliner_small-v2.5` loads in 2.09 s with 1.7 GB peak RSS and a 863 MB Python/torch venv; `fastino/gliner2-multi-v1` failed to load through the 2.0.0 package (incompatible config/loader, 111.78 s attempt). GLiNER2 is rejected as a bundled dependency; a future ONNX sidecar under ~150 MB remains the revisit bar.
- [x] Schema v21 (additive): `memory_entities` (POLE+O types, `name_norm` unique per scope), `memory_mentions` (span provenance), `memory_facts` (supersede-based correction), `memory_edges` (typed relations incl. `same_as`), `memory_fts` (FTS5). Migration v20→v21 with backup, covered by an upgrade test on a pre-seeded v20 file; 676 host-core tests, `cargo clippy`, and `cargo fmt --check` pass with an isolated Cargo target directory (the repository `target` dir hit the known local build-directory failure).
- [ ] Wire `memory.*` settings/list methods through Electron main to the renderer (a memory settings surface with retention controls); no memory logic outside host-core.
- [x] Agent-facing tools `MemorySearch` and `MemoryRecord` registered in host-core (`rpc/memory_tools.rs`) and declared to the model by the agent runtime (`src/memory-tools.ts` mirror + runtime registration). The agent now uses memory autonomously: search at decision time, record/correct verified facts; host owns every write with session/turn provenance. Tests: 3 host-core tool tests (cross-session roundtrip, project isolation, correction supersede, argument validation) plus 679/679 host-core suite, agent-runtime typecheck, and 258/258 `runtime.test.ts`.
- [ ] Implement the stage-1 heuristic extractor (automatic post-turn extraction); the agent-driven `MemoryRecord` path above already covers manual/provider-backed recording with schema-validated, size-bounded input and confidence/provenance.
- [ ] Add the memory surface in the renderer (list/search/correct/delete with provenance) with retention controls per scope.
- [ ] Evaluate a bundled speech adapter; offer selectable pt-BR voices, preview, playback, stop, and save, with clear online/offline behavior. Do not require Python or Docker installation.
- [ ] Add the first-party “Knowledge Source” panel for profile-wide and project-specific files/URLs, real ingestion stages, citations, deduplication, retry/cancel, and removal of derived data.
- [ ] Evaluate Open Notebook's extraction approach and license without embedding its Docker/service stack.
- [ ] Add inline audio/video response previews and “Save as” controls requested for generated media.
- [ ] `pi-supermemory` stays out per the ADR: the native relational memory supersedes it unless a later requirement reopens the question.

## Validation gates and current evidence

- [x] Targeted portable-profile, semantic-plugin, and shortcut tests passed in the fork.
- [x] Desktop/shared type checks, Electron build, documentation checks, and `git diff --check` passed for the implemented slices.
- [x] Architect reran 21 focused desktop tests, 1,124 shared-package tests, 29 i18n tests, desktop typecheck, Electron build, and documentation checks after the delegated fixes.
- [x] For the newer source slices, architect reran 87 focused desktop tests, 1,124 shared-package tests, desktop typecheck, documentation checks, `git diff --check`, and six Rust ZRouter tests with an isolated Cargo target directory. The first Rust rerun hit a local build-directory error before tests and was repeated successfully in scratch.
- [x] Memory slice (2026-09-29): ADR + schema v21 + storage core + agent-facing tools (`MemorySearch`, `MemoryRecord`). 679 host-core unit tests, `cargo clippy -p host-core --all-targets` (exit 0, no new warnings beyond the pre-existing `permissions.rs` one), `cargo fmt --check`, dedicated v20→v21 migration test, agent-runtime typecheck, 258/258 `runtime.test.ts`, and 36/36 `native-pi-session.test.ts` (baseline Windows POSIX-split failure fixed with `basename()`) all pass under an isolated Cargo target directory.
- [x] Rust `host-core` release build passed; 25 `user_skills::tests` passed. The only build warning observed was the pre-existing unused `created_at` field in `permissions.rs`.
- [x] Run a clean-folder packaged-app startup smoke test: window, host-core, sidecar, and semantic plugin launched, with profile data created beside the copied executable. The test exposed stale window branding and missing updater metadata.
- [ ] Verify the full first-run flow in the packaged app, including pt-BR UI, plugin tool use, ZRouter onboarding, and profile-local instruction/skill paths.
- [ ] Run relevant full integration/E2E suites against the final candidate and record failures separately from environment-related baseline failures.
- [ ] Audit the release for secrets and personal files, verify its checksum/signature, and test it on a Windows account without development tools.

## Suggested next sequence

1. Boot-test the unsigned portable in a disposable folder; fix any startup or bundled-plugin failures.
2. Complete semantic/native skill integration and project isolation, then first-run ZRouter credential flow.
3. Finish `--install` and portable self-update with ACL, integrity, and rollback tests.
4. Complete pt-BR audit, release gates, and publication.
5. Start Phase 2 feasibility work before selecting memory, speech, or knowledge-ingestion engines.
