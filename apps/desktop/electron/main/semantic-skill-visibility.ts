import { lstat } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import type { UserSkillRecord } from "@pi-desktop/shared";
import type { RegisteredPluginSkill } from "./plugin-runtime";

export const SEMANTIC_SKILLS_PLUGIN_ID = "local.pi-semantic-skills";
export const SEMANTIC_ROUTER_SKILL_ID = "semantic-router";

/**
 * The semantic router reads profile skills itself. Hide only host-core global
 * metadata that points into that same profile directory; another profile's
 * global catalog and project records remain independently visible.
 */
export async function filterSemanticRouterDuplicateUserSkills(
  skills: UserSkillRecord[],
  {
    dataDir,
    semanticRouterActive,
  }: {
    dataDir: string;
    semanticRouterActive: boolean;
  },
): Promise<UserSkillRecord[]> {
  if (!semanticRouterActive) return skills;
  const profileSkillsDir = resolve(dataDir, "skills");
  if (!(await regularDirectory(profileSkillsDir))) return skills;
  const visible = await Promise.all(
    skills.map(async (skill) => ({
      skill,
      discoverable: await isSemanticRouterDiscoverableProfileSkill(skill, profileSkillsDir),
    })),
  );
  return visible.filter(({ discoverable }) => !discoverable).map(({ skill }) => skill);
}

/** True only when the loaded router contribution is active for this project. */
export function semanticRouterActiveForProject(
  skills: RegisteredPluginSkill[],
  projectPath: string | null | undefined,
  pluginActiveInProject: (pluginId: string, projectPath: string | null | undefined) => boolean,
): boolean {
  return skills.some(
    (skill) =>
      skill.pluginId === SEMANTIC_SKILLS_PLUGIN_ID &&
      skill.skillId === SEMANTIC_ROUTER_SKILL_ID &&
      pluginActiveInProject(skill.pluginId, projectPath),
  );
}

function isPathWithin(parent: string, child: string): boolean {
  if (!child.trim()) return false;
  const relativePath = relative(parent, resolve(child));
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !relativePath.startsWith("../") &&
    !relativePath.startsWith("..\\")
  );
}

/**
 * Match the semantic router's intentionally narrow scanner: no links, no
 * traversal, and a capped regular markdown document. A host-core import can
 * legitimately expose more shapes, which must remain in its catalog.
 */
async function isSemanticRouterDiscoverableProfileSkill(
  skill: UserSkillRecord,
  profileSkillsDir: string,
): Promise<boolean> {
  if (skill.level !== "global" || !isPathWithin(profileSkillsDir, skill.path)) return false;
  const documentPath = resolve(skill.path);
  const document = await regularFileWithinLimit(documentPath);
  if (!document) return false;

  const parent = dirname(documentPath);
  if (parent === profileSkillsDir) {
    return basename(documentPath).toLowerCase().endsWith(".md");
  }
  if (basename(documentPath) !== "SKILL.md" || dirname(parent) !== profileSkillsDir) {
    return false;
  }
  return regularDirectory(parent);
}

async function regularFileWithinLimit(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size <= 128 * 1024;
  } catch {
    return false;
  }
}

async function regularDirectory(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}
