import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the packaged renderer uses the Z-PI native window title", async () => {
  const [html, windowSource, appNameSource] = await Promise.all([
    read("../index.html"),
    read("../electron/main/bootstrap/window.ts"),
    read("../../../packages/shared/src/protocol.ts"),
  ]);

  assert.match(html, /<title>Z-PI<\/title>/);
  assert.doesNotMatch(html, /<title>PI-Desktop<\/title>/);
  assert.match(appNameSource, /export const APP_NAME = "Z-PI"/);
  assert.match(windowSource, /title: APP_NAME/);
});
