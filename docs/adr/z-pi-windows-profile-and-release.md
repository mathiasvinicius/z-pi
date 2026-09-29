# ADR z-pi-windows-profile-and-release: Isolate portable profiles and release identity

- Status: Accepted for incremental implementation
- Date: 2026-09-29
- Scope: Z-PI fork, Windows first

## Context

Upstream PI-Desktop uses a home-based `.pi-desktop` data directory and an
Electron `userData` path based on its product name. Its updater points to the
upstream GitHub repository. The previous Z-PI wrapper provided separate
per-folder profiles, a profile-local global `AGENTS.md`, Portuguese defaults,
and a distinct update source. The fork must own these behaviors without
patching a downloaded upstream `app.asar`.

An electron-builder portable executable expands the internal Electron app to
a temporary location. `process.execPath` is therefore not the portable file the
user copied. The original file path is supplied as
`PORTABLE_EXECUTABLE_FILE`.

## Decision

For a packaged Windows portable build, derive the profile root from the
absolute original executable path. Keep host-core state at
`<exe-directory>/.pi-desktop` and Chromium `userData` at
`<exe-directory>/.pi-desktop/electron`. Assign `userData` before Electron's
single-instance lock, so one root admits one process and different roots may
run simultaneously. An explicit `PI_DESKTOP_DATA_DIR` or `--user-data-dir`
continues to win for development and isolated test runs. Other packaged
distributions retain their existing data path until a dedicated migration is
defined.

Pass the resolved profile root to child processes, including the agent runtime,
and use `<profile>/agent/AGENTS.md` for the global instruction file. Keep
project `AGENTS.md` resolution unchanged. Set `PI_DESKTOP_AGENTS_DIR` and the
fork-specific `Z_PI_PROFILE_ROOT` only for packaged Windows portable runs, so
global skill discovery does not fall back to the user's home directory. Existing
non-portable installs keep their prior instruction and skill roots until an
explicit migration is designed.

Use Z-PI application identity and GitHub publisher metadata. The release feed
must be `mathiasvinicius/z-pi`; upstream remains a Git source for reviewed
code integration, not an update source for installed Z-PI copies.

New profiles default to pt-BR. A previously stored language selection remains
authoritative; explicit `auto` still follows the OS locale.

## Consequences and remaining work

The portable root must be writable. It should fail clearly rather than move
data to another profile silently. Existing PI-Desktop home data is not imported
without an explicit migration path. The portable target remains manual-update
only until a verified, rollback-capable portable executable swap is built;
Electron's NSIS `quitAndInstall` must not install an NSIS package over a
portable copy. `--install` under ProgramData needs a separate least-privilege
ACL design before it can store credentials there. The portable profile is now
marked hidden on Windows, but this does not restrict read access. First-run
ZRouter setup and full native semantic skill integration are follow-up slices.

## Alternatives considered

- `process.execPath` as the portable root: rejected because it points to the
  transient extraction directory.
- Home-based shared data for every copy: rejected because independent executable
  folders would share credentials, skills, and the instance lock.
- Force automatic `electron-updater` installs for portable builds: rejected
  because the current Windows in-app path invokes an NSIS installer.
