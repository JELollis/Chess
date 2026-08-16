import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ENGINE_ID, getEngine, registerEngine } from "../app/engine-registry.ts";

test("registers and dispatches an engine by id", async () => {
  registerEngine({ id: "stub", label: "Stub", search: async () => "e4" });
  assert.equal(getEngine("stub").label, "Stub");
  assert.equal(await getEngine("stub").search("fen", 1), "e4");
});

test("an unknown or missing id falls back to the default engine", () => {
  registerEngine({ id: DEFAULT_ENGINE_ID, label: "Default", search: async () => "d4" });
  assert.equal(getEngine("does-not-exist").id, DEFAULT_ENGINE_ID);
  assert.equal(getEngine(undefined).id, DEFAULT_ENGINE_ID);
});
