import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");
const store = await read("../src/stores/app-store.ts");
const state = await read("../src/stores/app-state.ts");
const initialState = await read("../src/stores/slices/initial-state.ts");
const interaction = await read("../src/stores/slices/interaction-slice.ts");
const page = await read("../src/components/settings/ModelConfigPage.tsx");
const setup = await read("../src/components/settings/ProviderSetupDialog.tsx");
const recommendation = await read("../src/components/settings/useRecommendedModelSelection.ts");

test("only a fresh empty profile routes to the ZRouter add form", () => {
  assert.match(
    store,
    /onboarding\?\.showZRouterSetup[\s\S]*?providers\.providers\.length === 0[\s\S]*?set\(\{ zRouterSetupIntent: true \}\)[\s\S]*?get\(\)\.setSettingsTab\("agent"\)/,
  );
  assert.match(page, /consumeZRouterSetupIntent\(\)/);
  assert.match(page, /setInitialServiceId\("zrouter"\)/);
  assert.match(setup, /initialServicePreset\?\.id \?\? serviceIdFor\(provider\)/);
  assert.match(setup, /initialServicePreset\?\.baseUrl/);
  assert.match(setup, /initialServicePreset\?\.apiStyle/);
  assert.match(state, /zRouterSetupIntent: boolean/);
  assert.match(initialState, /zRouterSetupIntent: false/);
});

test("consuming the prompt is one-shot for this renderer mount", () => {
  assert.match(state, /zRouterSetupPromptHandled: boolean/);
  assert.match(initialState, /zRouterSetupPromptHandled: false/);
  assert.match(store, /!get\(\)\.zRouterSetupPromptHandled/);
  assert.match(
    interaction,
    /consumeZRouterSetupIntent: \(\) => \{[\s\S]*?get\(\)\.providers\.length === 0[\s\S]*?zRouterSetupIntent: false, zRouterSetupPromptHandled: true[\s\S]*?return shouldOpen/,
  );
});

test("the normal add, edit and copy dialog paths keep their existing inputs", () => {
  assert.match(page, /provider=\{editingProvider\}/);
  assert.match(page, /initialDraft=\{copyDraft\}/);
  assert.match(page, /const openAddProvider = \(\) => \{[\s\S]*?setInitialServiceId\(undefined\)[\s\S]*?setSetupFor\(""\)/);
  assert.match(page, /const openCopyProvider = \(provider: ProviderPublic\) => \{[\s\S]*?setInitialServiceId\(undefined\)[\s\S]*?copyProviderConfiguration\(/);
  assert.match(page, /const openEditProvider = \(provider: ProviderPublic\) => \{[\s\S]*?setInitialServiceId\(undefined\)[\s\S]*?setSetupFor\(provider\.id\)/);
  assert.match(page, /const afterSaved = async[\s\S]*?setSetupFor\(null\);[\s\S]*?setInitialServiceId\(undefined\)/);
  assert.match(page, /onClick=\{openAddProvider\}/);
  assert.match(page, /onCopy=\{openCopyProvider\}/);
  assert.match(page, /: openEditProvider\(provider\)/);
  assert.match(setup, /if \(provider\) \{[\s\S]*?api\.updateProvider\(/);
  assert.match(setup, /\} else \{[\s\S]*?api\.createProvider\(/);
});

test("only ZRouter's automatic first recommendation receives the default alias", () => {
  assert.match(setup, /defaultFirstModelAlias: namedPreset\?\.id === "zrouter" \? "ZROUTER" : undefined/);
  assert.match(recommendation, /if \(!enabled \|\| touchedRef\.current \|\| !recommendable\) return/);
  assert.match(recommendation, /labelFirstRecommendation\([\s\S]*?defaultFirstModelAlias/);
  assert.match(recommendation, /picks\[0\]\.alias !== undefined/);
});
