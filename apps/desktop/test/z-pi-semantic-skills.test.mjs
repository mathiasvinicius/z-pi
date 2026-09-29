import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = join(here, "..", "resources", "plugins", "local.pi-semantic-skills");
const require = createRequire(import.meta.url);
const core = require(join(pluginDir, "core.js"));
const entry = require(join(pluginDir, "main.js"));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "z-pi-semantic-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profile = join(root, ".pi-desktop");
  const data = join(profile, "plugins", "data", "local.pi-semantic-skills");
  mkdirSync(data, { recursive: true });
  return { profile, data };
}

test("semantic skills are bundled as a first-party plugin with one router", () => {
  const manifest = JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));
  assert.equal(manifest.id, "local.pi-semantic-skills");
  assert.deepEqual(manifest.contributes.skills, ["skills/semantic-router.md"]);
  assert.deepEqual(manifest.contributes.agentTools.map(tool => tool.name), [
    "semantic_skills_find", "semantic_skills_read", "semantic_skills_learn",
  ]);
});

test("local profile skills are discovered without migration, duplication or overwrites", t => {
  const { profile, data } = fixture(t);
  const native = join(profile, "skills");
  const library = join(data, "library");
  mkdirSync(native, { recursive: true });
  mkdirSync(library, { recursive: true });
  const localBody = "---\nname: pptx\ndescription: Ariane presentation style\n---\n\nLocal instructions\n";
  writeFileSync(join(native, "pptx.md"), localBody);
  writeFileSync(join(library, "pptx.md"), "---\nname: pptx\ndescription: generic\n---\n\nGeneric\n");
  const skills = core.listSkills(data).skills;
  assert.equal(skills.length, 1);
  assert.equal(skills[0].body, localBody);
  assert.equal(skills[0].owned, false);
  assert.equal(readFileSync(join(native, "pptx.md"), "utf8"), localBody);
  assert.equal(core.saveLearned(data, {
    name: "pptx", description: "Presentations", procedure: "New", evidence: "Verified",
  }, { action: "improve", targetId: "pptx", mergedProcedure: "New" }).status, "review_required");
  writeFileSync(join(native, "audio.md"), "---\nname: audio\ndescription: Audio workflow\n---\n\nSteps\n");
  assert.deepEqual(core.listSkills(data).skills.map(skill => skill.id).sort(), ["audio", "pptx"]);
});

test("directory skill packages are discovered with profile priority and no writes", t => {
  const { profile, data } = fixture(t);
  const native = join(profile, "skills");
  const library = join(data, "library");
  const localPackage = join(native, "presentation");
  const libraryPackage = join(library, "presentation");
  mkdirSync(localPackage, { recursive: true });
  mkdirSync(libraryPackage, { recursive: true });
  const localBody = "---\nname: Slides\ndescription: Local presentation style\n---\n\nLocal steps\n";
  writeFileSync(join(localPackage, "SKILL.md"), localBody);
  writeFileSync(join(libraryPackage, "SKILL.md"), "---\nname: Slides\ndescription: Generic\n---\n\nGeneric steps\n");
  mkdirSync(join(library, "audio"));
  writeFileSync(join(library, "audio", "SKILL.md"), "Audio instructions without frontmatter\n");
  writeFileSync(join(library, "audio.md"), "---\nname: audio\n---\n\nFlat instructions\n");
  mkdirSync(join(library, "notes"));
  writeFileSync(join(library, "notes", "SKILL.md"), "Notes instructions without frontmatter\n");
  const skills = core.listSkills(data).skills;
  assert.deepEqual(skills.map(skill => skill.id), ["slides", "audio", "notes"]);
  assert.equal(skills[0].body, localBody);
  assert.equal(skills[0].owned, false);
  assert.equal(skills[1].body.includes("Flat instructions"), true);
  assert.equal(skills[1].owned, false);
  assert.equal(skills[2].name, "notes");
  assert.equal(readFileSync(join(localPackage, "SKILL.md"), "utf8"), localBody);
  assert.equal(readFileSync(join(libraryPackage, "SKILL.md"), "utf8").includes("Generic steps"), true);
  assert.equal(core.saveLearned(data, {
    name: "Slides", description: "Presentations", procedure: "New", evidence: "Verified",
  }, { action: "improve", targetId: "slides", mergedProcedure: "New" }).status, "review_required");
  assert.equal(core.saveLearned(data, {
    name: "Slides", description: "Presentations", procedure: "New", evidence: "Verified",
  }, { action: "create" }).status, "review_required");
});

test("directory discovery skips oversized documents and linked paths", t => {
  const { profile, data } = fixture(t);
  const native = join(profile, "skills");
  const outside = join(profile, "outside");
  mkdirSync(native, { recursive: true });
  mkdirSync(outside);
  mkdirSync(join(native, "large"));
  writeFileSync(join(native, "large", "SKILL.md"), "x".repeat(128 * 1024 + 1));
  writeFileSync(join(outside, "SKILL.md"), "---\nname: outside\n---\n\nDo not discover\n");
  try {
    symlinkSync(outside, join(native, "linked-package"), "junction");
    symlinkSync(join(outside, "SKILL.md"), join(native, "linked.md"), "file");
    mkdirSync(join(native, "linked-document"));
    symlinkSync(join(outside, "SKILL.md"), join(native, "linked-document", "SKILL.md"), "file");
  } catch (error) {
    if (error.code !== "EPERM") throw error;
    t.diagnostic("Symlinks unavailable on this host; oversized document still checked");
  }
  assert.deepEqual(core.listSkills(data).skills, []);
});

test("two profile roots never share learned skills", t => {
  const left = fixture(t);
  const right = fixture(t);
  const input = {
    name: "sound edit", description: "Edit a sound file", procedure: "Verify format", evidence: "Played",
  };
  assert.equal(core.saveLearned(left.data, input, { action: "create" }).status, "created");
  assert.equal(core.listSkills(left.data).skills.length, 1);
  assert.equal(core.listSkills(right.data).skills.length, 0);
});

test("bundled plugin registers only its three tools without mutating the profile", async t => {
  const { profile, data } = fixture(t);
  const skills = join(profile, "skills");
  mkdirSync(skills, { recursive: true });
  const body = "---\nname: local\ndescription: Private skill\n---\n\nLocal\n";
  writeFileSync(join(skills, "local.md"), body);
  const registered = [];
  const unregistered = [];
  const previous = globalThis.pi;
  t.after(() => { globalThis.pi = previous; });
  globalThis.pi = {
    plugin: { getDataPath: async () => data },
    agent: {
      registerTool: async tool => registered.push(tool.name),
      unregisterTool: async name => unregistered.push(name),
    },
  };
  await entry.onLoad();
  assert.deepEqual(registered, ["semantic_skills_find", "semantic_skills_read", "semantic_skills_learn"]);
  assert.equal(readFileSync(join(skills, "local.md"), "utf8"), body);
  await entry.onUnload();
  assert.deepEqual(unregistered, registered);
});
