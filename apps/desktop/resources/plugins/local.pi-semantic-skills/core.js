"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_SKILL_BYTES = 128 * 1024;
const STOP = new Set("a o e de da do das dos para por com em um uma que como no na nos nas eu quero preciso fazer usar the and for with to of in".split(" "));

function fold(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function tokens(value) {
  return [...new Set(fold(value).replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(x => x.length > 2 && !STOP.has(x)))];
}

function similarity(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common++;
  return common / (left.size + right.size - common);
}

function slug(value) {
  return fold(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function parseSkill(body, file, owned) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(body);
  const yaml = front ? front[1] : "";
  const field = key => {
    const m = new RegExp(`^${key}:\\s*(.+)$`, "mi").exec(yaml);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : "";
  };
  let related = [];
  const rawRelated = field("related_skills");
  if (rawRelated) related = rawRelated.replace(/^\[|\]$/g, "").split(",").map(s => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  const fallbackName = path.basename(file) === "SKILL.md" ? path.basename(path.dirname(file)) : path.basename(file, ".md");
  return {
    id: slug(field("name") || fallbackName),
    name: field("name") || fallbackName,
    description: field("description"),
    related,
    body,
    file,
    owned
  };
}

function profileRoot(dataPath) {
  const resolved = path.resolve(dataPath);
  if (path.basename(path.dirname(resolved)) !== "data" || path.basename(path.dirname(path.dirname(resolved))) !== "plugins") {
    throw new Error("Diretório de dados do plugin inesperado");
  }
  return path.dirname(path.dirname(path.dirname(resolved)));
}

function readSkillDocument(file) {
  let descriptor;
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_SKILL_BYTES) return null;
    const buffer = Buffer.allocUnsafe(MAX_SKILL_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = fs.readSync(descriptor, buffer, length, buffer.length - length, null);
      if (!read) break;
      length += read;
    }
    return length > MAX_SKILL_BYTES ? null : buffer.toString("utf8", 0, length);
  } catch {
    // A skill removed or replaced while scanning should not hide other skills.
    return null;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function listSkills(dataPath) {
  const root = profileRoot(dataPath);
  const directory = path.join(dataPath, "library");
  const ownedFile = path.join(dataPath, "owned.json");
  let owned = {};
  try { owned = JSON.parse(fs.readFileSync(ownedFile, "utf8")); } catch { /* first run */ }
  if (!owned || typeof owned !== "object" || Array.isArray(owned)) owned = {};
  const skills = [];
  const seen = new Set();
  // Profile-authored files take precedence over an older plugin-library copy.
  // Read both locations in place: startup must never move, replace, or delete
  // a local skill just to make it discoverable by the semantic resolver.
  for (const sourceDirectory of [path.join(root, "skills"), directory]) {
    let sourceStat;
    try { sourceStat = fs.lstatSync(sourceDirectory); } catch { continue; }
    if (!sourceStat.isDirectory()) continue;
    const entries = fs.readdirSync(sourceDirectory, { withFileTypes: true });
    // Keep the existing flat-file precedence within a source. Package folders
    // are one level deep; resources and linked paths are never traversed.
    const files = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map(entry => ({ file: path.join(sourceDirectory, entry.name), ownedName: entry.name }));
    const packages = entries.filter(entry => entry.isDirectory())
      .map(entry => ({ file: path.join(sourceDirectory, entry.name, "SKILL.md"), ownedName: null }));
    for (const { file, ownedName } of [...files, ...packages]) {
      const body = readSkillDocument(file);
      if (body === null) continue;
      const skill = parseSkill(body, file, sourceDirectory === directory && ownedName !== null && owned[ownedName] === crypto.createHash("sha256").update(body).digest("hex"));
      if (!skill.id || seen.has(skill.id)) continue;
      seen.add(skill.id);
      skills.push(skill);
    }
  }
  return { skills, owned, directory, ownedFile };
}

function rank(query, skills, limit = 5) {
  const max = Math.max(1, Math.min(10, Number(limit) || 5));
  const scored = skills.map(skill => ({ skill, score: Math.max(
    similarity(query, skill.name) * 1.5,
    similarity(query, `${skill.name} ${skill.description}`)
  ) })).sort((a, b) => b.score - a.score);
  const selected = scored.filter(x => x.score > 0).slice(0, max);
  const names = new Set(selected.map(x => x.skill.id));
  for (const entry of [...selected]) {
    for (const rel of entry.skill.related) {
      const found = skills.find(s => s.id === slug(rel));
      if (found && !names.has(found.id) && selected.length < max + 3) {
        selected.push({ skill: found, score: entry.score * 0.6, relatedTo: entry.skill.name });
        names.add(found.id);
      }
    }
  }
  return selected;
}

function containsSecret(text) {
  return /(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN (?:OPENSSH|RSA|EC|PRIVATE)|(?:api[_ -]?key|token|senha|password|secret)\s*[:=]\s*\S{8,})/i.test(text);
}

function atomicWrite(file, content) {
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, content, { encoding: "utf8", flag: "wx" });
  fs.renameSync(temp, file);
}

function renderSkill({ name, description, procedure, related = [] }) {
  const clean = value => String(value).replace(/[\r\n]+/g, " ").replace(/:/g, " - ").trim();
  const relations = related.map(slug).filter(Boolean);
  return `---\nname: ${clean(name)}\ndescription: ${clean(description)}\nrelated_skills: [${relations.join(", ")}]\n---\n\n# ${clean(name)}\n\n${String(procedure).trim()}\n`;
}

function saveLearned(dataPath, input, decision) {
  const { name, description, procedure, evidence } = input;
  if (![name, description, procedure, evidence].every(x => typeof x === "string" && x.trim())) throw new Error("Nome, descrição, procedimento e evidência são obrigatórios");
  if (name.length > 80 || description.length > 240 || procedure.length > 20000 || evidence.length > 2000) throw new Error("Registro de skill excede o limite");
  if (containsSecret(`${name}\n${description}\n${procedure}\n${evidence}`)) throw new Error("Possível segredo detectado; skill não gravada");
  const state = listSkills(dataPath);
  const target = decision?.targetId ? state.skills.find(s => s.id === decision.targetId) : null;
  if (decision?.action === "same") return { status: "unchanged", name: target?.name || name };
  if (decision?.action === "review") return { status: "review_required", candidate: target?.name || null };
  if (decision?.action === "existing") return { status: "existing_unmanaged", candidate: target?.name || null };
  if (decision?.action === "improve") {
    if (!target || !target.owned) return { status: "review_required", candidate: target?.name || null };
    const merged = String(decision.mergedProcedure || "").trim();
    if (!merged || merged.length > 20000 || containsSecret(merged)) return { status: "review_required", candidate: target.name };
    const body = renderSkill({ name: target.name, description: target.description, procedure: merged, related: [...new Set([...target.related, ...(input.related || [])])] });
    if (body === target.body) return { status: "unchanged", name: target.name };
    const archive = path.join(dataPath, "history");
    fs.mkdirSync(archive, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(archive, `${path.basename(target.file)}.${stamp}.bak`), target.body, { flag: "wx" });
    atomicWrite(target.file, body);
    state.owned[path.basename(target.file)] = crypto.createHash("sha256").update(body).digest("hex");
    atomicWrite(state.ownedFile, JSON.stringify(state.owned, null, 2) + "\n");
    return { status: "improved", name: target.name, file: target.file };
  }
  if (decision?.action !== "create") return { status: "review_required" };
  const id = slug(name);
  if (!id) throw new Error("Nome de skill inválido");
  const file = path.join(state.directory, `${id}.md`);
  if (fs.existsSync(file) || state.skills.some(s => s.id === id)) return { status: "review_required", candidate: name };
  fs.mkdirSync(state.directory, { recursive: true });
  const body = renderSkill(input);
  fs.writeFileSync(file, body, { encoding: "utf8", flag: "wx" });
  state.owned[path.basename(file)] = crypto.createHash("sha256").update(body).digest("hex");
  atomicWrite(state.ownedFile, JSON.stringify(state.owned, null, 2) + "\n");
  return { status: "created", name, file };
}

module.exports = { profileRoot, listSkills, rank, similarity, slug, saveLearned, containsSecret };
