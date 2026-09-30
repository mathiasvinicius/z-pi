//! Read-only compatibility with the previous bundled plugin's learned library.
use crate::agent_capabilities::parse_front_matter;
use std::{
    fs,
    path::{Path, PathBuf},
};

const MAX_DOCUMENT: u64 = 128 * 1024;
const LIBRARY: &str = "local.pi-semantic-skills";

pub struct LegacySkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub body: String,
}

fn slug(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(60)
        .collect()
}

fn read_file(path: &Path) -> Option<LegacySkill> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > MAX_DOCUMENT {
        return None;
    }
    let raw = fs::read_to_string(path).ok()?;
    if raw.len() as u64 > MAX_DOCUMENT {
        return None;
    }
    let (front, body) = parse_front_matter(&raw);
    if body.trim().is_empty() {
        return None;
    }
    let stem = path.file_stem()?.to_str()?;
    let name = front.get("name").map(String::as_str).unwrap_or(stem).trim();
    let id = slug(name);
    if id.is_empty() {
        return None;
    }
    Some(LegacySkill {
        id,
        name: name.into(),
        description: front.get("description").cloned().unwrap_or_default(),
        body: raw,
    })
}

pub fn list(data_dir: &Path) -> Vec<LegacySkill> {
    let directory: PathBuf = data_dir.join("plugins/data").join(LIBRARY).join("library");
    if !fs::symlink_metadata(&directory).is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink()) {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut paths: Vec<_> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        })
        .collect();
    paths.sort();
    paths
        .into_iter()
        .filter_map(|path| read_file(&path))
        .collect()
}
