import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { APP_NAME } from "@pi-desktop/shared";

/**
 * The two directories that define an installation, and the development split
 * between them.
 *
 * A packaged PI-Desktop and a `pnpm dev` host used to share both: the
 * name-derived `userData` — where Electron keeps the single-instance lock,
 * renderer `localStorage`, and the plugin panel partitions — and
 * `~/.pi-desktop`, where host-core keeps `pi.sqlite` beside the persistence
 * outbox and the log tree. Sharing them meant a shipped app that was already
 * running held the lock, so the development launch quit on arrival; a
 * development host that won the race instead put a second host-core over the
 * same single-writer database, which is the divergence D236 exists to
 * prevent. Neither is workable while someone debugs against the app they use.
 *
 * Z-PI's Windows portable build adds a third case: the original executable
 * location owns both Chromium state and `.pi-desktop`. Existing non-portable
 * installs keep their original default path. `PI_DESKTOP_DATA_DIR` remains an
 * explicit override for development and isolated tests.
 */

/** `userData` directory of a development installation, beside the shipped one. */
export const DEVELOPMENT_INSTALLATION_NAME = `${APP_NAME} Dev`;

/** Data directory of a shipped installation, below the user's home. */
export const INSTALLATION_DATA_DIR_NAME = ".pi-desktop";

/** Data directory of a development installation, below the user's home. */
export const DEVELOPMENT_DATA_DIR_NAME = ".pi-desktop-dev";

export type DataDirInput = {
  /** `PI_DESKTOP_DATA_DIR`; an explicit directory wins over either profile. */
  override: string | undefined;
  /** True for a development build. */
  development: boolean;
  /** The user's home directory. */
  home: string;
  /** Original Windows portable executable, before electron-builder extracts it. */
  portableExecutable?: string;
};

/**
 * The data directory one installation owns. Portable Windows executables use
 * `PORTABLE_EXECUTABLE_FILE`, not Electron's temporary extraction directory.
 *
 * `PI_DESKTOP_DATA_DIR` stays the escape hatch it always was: an explicit
 * directory wins, which is how the E2E harnesses and capture rig keep choosing
 * their own root. The result is absolute,
 * because it reaches host-core as a child-process environment variable from a
 * working directory that need not be this one, and because `homedir()` is the
 * only other input that could be relative. Portable builds use the absolute
 * original executable path; other builds retain their former home-based root.
 */
export function resolveDataDir({
  override,
  development,
  home,
  portableExecutable,
}: DataDirInput): string {
  const explicit = override?.trim();
  if (explicit) return resolve(explicit);
  if (!development && portableExecutable?.trim() && isAbsolute(portableExecutable.trim())) {
    return join(dirname(resolve(portableExecutable.trim())), INSTALLATION_DATA_DIR_NAME);
  }
  return resolve(
    join(
      home,
      development ? DEVELOPMENT_DATA_DIR_NAME : INSTALLATION_DATA_DIR_NAME,
    ),
  );
}

/**
 * The data directory this process owns.
 *
 * Electron main passes its own verdict for `development`, because only it can
 * ask `app.isPackaged`, and it publishes the resolved directory back to
 * `PI_DESKTOP_DATA_DIR` at boot. That publication is what keeps the plugin
 * runtime — which resolves this root from the environment rather than taking
 * it as a parameter — on one directory instead of falling back to the shipped
 * default, which would strand a development host's plugin data inside the
 * packaged profile.
 */
export function desktopDataDir(
  development: boolean = process.env.PI_DESKTOP_DEV === "1",
): string {
  return resolveDataDir({
    override: process.env.PI_DESKTOP_DATA_DIR,
    development,
    home: homedir(),
    portableExecutable: process.platform === "win32"
      ? process.env.PORTABLE_EXECUTABLE_FILE
      : undefined,
  });
}

/** The Electron `app` surface this helper needs; kept structural so tests need no Electron. */
export type UserDataApp = {
  commandLine: { hasSwitch(name: string): boolean };
  getPath(name: "appData"): string;
  setPath(name: "userData", path: string): void;
};

/** Mark only the profile directory hidden on Windows; no files are moved. */
export function hidePortableProfile(
  profileRoot: string,
  platform: NodeJS.Platform = process.platform,
  run: typeof execFileSync = execFileSync,
): void {
  if (platform !== "win32") return;
  run("attrib.exe", ["+h", profileRoot], {
    windowsHide: true,
    timeout: 5_000,
    stdio: "ignore",
  });
}

/** Keep Chromium state and its single-instance lock with the portable profile. */
export function applyPortableUserData(
  app: UserDataApp,
  development: boolean,
  portableExecutable: string | undefined,
  override: string | undefined,
): void {
  if (
    development ||
    !portableExecutable?.trim() ||
    !isAbsolute(portableExecutable.trim()) ||
    override?.trim() ||
    app.commandLine.hasSwitch("user-data-dir")
  ) return;
  const profileRoot = resolveDataDir({
    override: undefined,
    development: false,
    home: homedir(),
    portableExecutable,
  });
  const userData = join(profileRoot, "electron");
  mkdirSync(userData, { recursive: true });
  // Windows does not treat a leading dot as hidden. This is cosmetic, not an
  // access control boundary; the profile remains in the same location.
  hidePortableProfile(profileRoot);
  app.setPath("userData", userData);
}

/**
 * Give a development build its own `userData` so the single-instance lock
 * does not collide with a shipped app that is already running (D236, ADR 0094).
 * An explicit `--user-data-dir` wins, because that is how the E2E harnesses
 * point a build at a throwaway profile.
 */
export function applyDevelopmentUserData(
  app: UserDataApp,
  development: boolean,
): void {
  if (development && !app.commandLine.hasSwitch("user-data-dir")) {
    app.setPath(
      "userData",
      join(app.getPath("appData"), DEVELOPMENT_INSTALLATION_NAME),
    );
  }
}
