# Native semantic skills migration (design gate)

Status: partial native read-only implementation. `SemanticSkillFind` and
`SemanticSkillRead` are Host-owned tools over the existing installed skill
catalog. The bundled `local.pi-semantic-skills` plugin remains active until
native learning, review/history, and read-only compatibility for its existing
library have equivalent behavior; no profile files are moved or removed.

The native tools rescan the current global and calling-session project catalog
at use time. Find returns metadata only; Read checks activation and project
scope again before loading one body. A normal skill install becomes discoverable
without restart. This is lexical intent matching, not yet the plugin's optional
model-assisted semantic ranking; the latter remains available through the
bundled plugin until migration is complete.

## Existing state

- Host-core `UserSkillRegistry` already scans global and project
  `.agents/skills/*.md` and one-level `<name>/SKILL.md`, tracks enabled state,
  shadows global entries with project entries, and reads bodies on demand.
- The bundled plugin independently scans `<profile>/skills` and its own
  `<profile>/plugins/data/local.pi-semantic-skills/library`; only the plugin
  knows about its `owned.json` and `history` data. Learned procedures may be
  stored in that library on existing installations. Nothing may delete, move,
  rewrite, or implicitly import them on upgrade.
- Electron Main currently removes a subset of native global metadata when the
  plugin router is active. This is a compatibility policy, not native semantic
  discovery; removing the plugin without replacing this path would strand the
  plugin-owned library and remove `semantic_skills_learn`.

## Target ownership and invariants

1. Host-core owns discovery, scope, document admission, identity, enablement,
   mutation and version history. The agent runtime owns only model-facing tool
   schemas and provider calls. Electron Main remains a thin host transport.
2. A fresh profile has no semantic plugin to grant permissions or inject a
   router skill. The agent receives one native discover/read/learn tool family;
   unrelated skill bodies are never sent at startup.
3. Discovery rescans native global and calling-session project roots at use
   time. Disabled skills do not surface. Project records shadow global records
   by normalized ID/name. A project call cannot name another project's root.
4. An existing plugin library remains readable in place after the bundled
   plugin is retired. A native skill with the same normalized ID takes
   precedence. Legacy files are never writable by native learn/update tools;
   history and `owned.json` remain untouched. User-installed copies of the
   plugin are not silently uninstalled or altered.
5. Learning must validate length and secrets, avoid duplicate goals, and
   return a review proposal rather than overwrite any unowned or manually
   edited skill. Changes to owned native skills require a recoverable previous
   version and a user approval boundary. An unsuccessful/missing provider
   cannot result in a destructive fallback.
6. Existing direct `Skill` invocation and composer suggestions remain valid
   for native/project/builtin/third-party plugin skills. Only duplicate metadata
   of skills discoverable by the native router may be suppressed.

## Acceptance checks

- With no plugin loaded: a new profile discovers a global skill, loads only
  the chosen instructions, and finds a newly downloaded package on the next
  lookup without restarting.
- Two projects with overlapping IDs return their own documents; a third
  project cannot read either project's private skill through find/read/learn.
- Two portable roots with different libraries do not share entries or learned
  files.
- An upgrade with existing plugin `library`, `owned.json` and `history`
  discovers its old skills in place and preserves their bytes, metadata and
  history. Editing an old plugin-owned file cannot silently change it.
- Similar procedures propose a revision rather than creating a duplicate;
  approved native revisions have rollback; rejected proposals leave files
  unchanged. Invalid/untrusted text does not elevate tool permissions.
- The final packaged-app test verifies the native tools are available without
  plugin permission grants, and that the old bundled plugin is absent.

Implementation should be incremental and independently verifiable: establish
contract fixtures, add native read-only discovery including legacy roots, then
port safe learning and approval/history, finally retire the bundled plugin and
its visibility shim. Do not mark P1.2 complete before the full user path and
packaged validation pass.
