# Z-PI Windows foundation (fork delta)

This specification supplements the upstream architecture and delivery specs.
It records only Z-PI differences; inherited behavior remains defined by the
existing domain specifications.

## Current implemented slice

- Windows portable builds resolve `.pi-desktop` beside the original executable
  (`PORTABLE_EXECUTABLE_FILE`), independent of the process working directory.
  Electron `userData`, including its single-instance lock, stays under that
  profile. Explicit test/development overrides remain effective. The current
  electron-builder portable target still expands application binaries to a
  temporary directory; this slice relocates profile state, not that extraction.
- Global agent instructions are read from `<profile>/agent/AGENTS.md` in a
  packaged Windows portable profile. Project-local instructions stay in
  projects. Global skills use the portable profile root. Non-portable installs
  retain their previous roots pending an explicit migration.
- New settings default to pt-BR; explicit choices and OS-auto mode remain.
- Windows no longer binds the global plugin launcher to Alt+Space by default.
  A user-selected launcher binding remains supported.
- Windows product metadata uses Z-PI, and update discovery/publication targets
  `mathiasvinicius/z-pi`. Portable builds continue to display a manual update
  link rather than invoking the NSIS installer. Manual checks configure the
  fork's GitHub feed explicitly because portable packaging lacks
  `app-update.yml`; stored automatic preferences cannot enable NSIS for a
  portable/ZIP build. Portable executable replacement is not implemented.
- The renderer HTML title is Z-PI, matching the native window title.
- ZRouter is a selectable provider preset with the endpoint
  `https://zrouter.itms.com.br/v1`. A fresh database records a one-time
  pending setup intent; the first renderer launch opens that preset's form
  when no provider exists. The user must type a key before the existing
  key-scoped model discovery and encrypted provider save can proceed. No
  provider or credential is created automatically. Existing databases do not
  receive the marker, and creating any provider completes it.
- The portable profile directory is marked hidden with the Windows directory
  attribute when Chromium state is first prepared. This is not an access
  control mechanism. No `app` directory is created beside the executable yet.
- The semantic-skills resolver is shipped as one bundled plugin. It contributes
  only a router skill to the plugin prompt, discovers profile-local Markdown
  skills on each lookup, and never moves or overwrites a pre-existing skill.
  A locally authored file wins over a duplicate plugin-library ID. Learned
  procedures are kept in the current profile's plugin data directory. The
  resolver also discovers one-level `<name>/SKILL.md` packages read-only;
  package resources are not loaded during search.
- When the router contribution is loaded and active for a project, Electron
  Main omits only duplicate native global skill metadata that the router can
  actually discover in this profile. Linked, oversized, unsupported, project,
  and other-root skills stay in the native catalog. Host-core ownership and
  on-demand direct `Skill` reads are unchanged.

## Required next slices

- The first unsigned Windows portable booted in a clean temporary folder:
  window, host-core, sidecar, and bundled semantic plugin became ready. A
  refreshed artifact showed the Z-PI window title and checked the fork's
  GitHub feed, which currently has no published release. Two temporary copies
  also opened concurrently with separate profile roots, while a repeat launch
  from one root did not open another window. The latest portable then
  clean-booted without an `app-update.yml` warning. Verify content/credential
  isolation and full first-run behavior.
- Decide whether to replace electron-builder's temporary extraction with a
  verified `<exe-directory>/app` layout before claiming that all runtime files
  execute from the portable root.
- Implement `Z-PI.exe --install` to `%ProgramData%/ITMS/Z-PI` only after defining
  per-user credential ACLs and a non-destructive upgrade path.
- If the future portable layout creates `<exe-directory>/app`, hide that newly
  created directory too. Do not hide unrelated pre-existing folders.
- Build a portable executable updater with staged downloads, integrity checks,
  process-exit swap, rollback, and retention of profile data.
- Verify the first-run ZRouter form in a packaged app with local model-discovery
  fixtures; add key validation/offline behavior, editable model alias, and
  automatic credential use by approved ZRouter tools without leaking the key.
- Complete project-scoped semantic discovery and native catalog integration.
  The current visibility policy removes only verified profile-level overlap;
  the plugin does not yet search project skills. Verify plugin tool use and
  selection in a packaged app before considering it production-ready.

See the repository-root `requerimentos.md` and
[the architecture decision](../../adr/z-pi-windows-profile-and-release.md).
