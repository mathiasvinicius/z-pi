# Bundled semantic skills

This plugin is a fork-local adaptation of the profile-scoped plugin previously
developed in PI-PKGS. Host-core discovers it from the packaged
`resources/plugins` directory, so no network fetch or separate Node.js
installation is needed at startup.

Only `skills/semantic-router.md` is advertised as a plugin skill. The three
tools discover, read, and learn procedures on demand. They read the current
profile's `skills/*.md` and their own `plugins/data/local.pi-semantic-skills/library`.
The profile-authored file takes precedence for the same normalized skill ID.
One-level `<name>/SKILL.md` packages are also discovered read-only; their
sibling resources are not read during search, and the plugin never edits a
package it did not create.
The resolver rescans on each call, so downloads and edits are visible without
restarting. It never migrates, deletes, or overwrites a profile-authored file.
Automatic improvement is limited to plugin-owned files whose content hash
still matches the last write; previous versions are archived locally.

Current limitation: the separate native global/project skill catalog is not
yet suppressed by this plugin. The plugin avoids duplicate IDs in its own
search results, but full single-catalog integration awaits a host-core slice.
An existing user-installed plugin with the same ID is intentionally retained
by the host registry instead of being overwritten by this bundled copy.
