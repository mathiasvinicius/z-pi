import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const {
  filterSemanticRouterDuplicateUserSkills,
  semanticRouterActiveForProject,
} = await import("../electron/main/semantic-skill-visibility.ts");

function skill({ id, level = "global", path, projectPath } = {}) {
  return {
    id: id ?? "skill",
    name: id ?? "skill",
    level,
    ...(projectPath ? { projectPath } : {}),
    enabled: true,
    source: "imported",
    path: path ?? "/other/.agents/skills/skill.md",
    sizeBytes: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const router = {
  id: "local.pi-semantic-skills/semantic-router",
  pluginId: "local.pi-semantic-skills",
  skillId: "semantic-router",
  name: "Semantic router",
  description: "Routes profile skills",
  path: "D:/plugins/semantic-router.md",
  bytes: 1,
};

function profileFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "semantic-visibility-"));
  const dataDir = join(root, ".pi-desktop");
  const skillsDir = join(dataDir, "skills");
  mkdirSync(skillsDir, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, dataDir, skillsDir };
}

test("semantic router hides only overlapping global profile metadata", async t => {
  const { root, dataDir, skillsDir } = profileFixture(t);
  const flat = join(skillsDir, "profile.md");
  const packageDir = join(skillsDir, "profile-package");
  const packaged = join(packageDir, "SKILL.md");
  writeFileSync(flat, "Profile instructions");
  mkdirSync(packageDir);
  writeFileSync(packaged, "Package instructions");
  const overlappingGlobal = skill({
    id: "profile",
    path: flat,
  });
  const packageGlobal = skill({
    id: "profile-package",
    path: packaged,
  });
  const otherGlobal = skill({ id: "other", path: join(root, ".agents", "skills", "other.md") });
  const projectSkill = skill({
    id: "project",
    level: "project",
    projectPath: join(root, "project"),
    path: join(root, "project", ".agents", "skills", "project.md"),
  });

  const visible = await filterSemanticRouterDuplicateUserSkills(
    [overlappingGlobal, packageGlobal, otherGlobal, projectSkill],
    { dataDir, semanticRouterActive: true },
  );

  assert.deepEqual(visible.map(({ id }) => id), ["other", "project"]);
});

test("router inactivity leaves the host catalog unchanged", async t => {
  const { dataDir, skillsDir } = profileFixture(t);
  const records = [skill({ path: join(skillsDir, "profile.md") })];
  assert.equal(
    await filterSemanticRouterDuplicateUserSkills(records, {
      dataDir,
      semanticRouterActive: false,
    }),
    records,
  );
});

test("semantic router retains linked, oversized, and unsupported profile records", async t => {
  const { dataDir, skillsDir } = profileFixture(t);
  const target = join(dataDir, "import-source.md");
  const linked = join(skillsDir, "linked.md");
  const oversized = join(skillsDir, "oversized.md");
  const nested = join(skillsDir, "nested", "deeper", "SKILL.md");
  writeFileSync(target, "Imported through host-core");
  writeFileSync(oversized, "x".repeat(128 * 1024 + 1));
  mkdirSync(join(skillsDir, "nested", "deeper"), { recursive: true });
  writeFileSync(nested, "Too deeply nested for the router");
  try {
    symlinkSync(target, linked, "file");
  } catch (error) {
    if (error.code !== "EPERM") throw error;
    t.diagnostic("File symlinks unavailable on this host; linked-record assertion skipped");
  }
  const records = [
    ...(existsSync(linked) ? [skill({ id: "linked", path: linked })] : []),
    skill({ id: "oversized", path: oversized }),
    skill({ id: "nested", path: nested }),
  ];

  const visible = await filterSemanticRouterDuplicateUserSkills(records, {
    dataDir,
    semanticRouterActive: true,
  });
  assert.deepEqual(visible.map(({ id }) => id), records.map(({ id }) => id));
});

test("router visibility follows its loaded project activation", () => {
  const activeFor = (pluginId, projectPath) =>
    pluginId === "local.pi-semantic-skills" && projectPath === "D:/work/selected";

  assert.equal(semanticRouterActiveForProject([router], "D:/work/selected", activeFor), true);
  assert.equal(semanticRouterActiveForProject([router], "D:/work/other", activeFor), false);
  assert.equal(semanticRouterActiveForProject([], "D:/work/selected", activeFor), false);
});
