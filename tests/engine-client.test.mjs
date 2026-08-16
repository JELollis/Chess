import assert from "node:assert/strict";
import test from "node:test";
import { createEngineClient } from "../app/engine-client.ts";

function recordingClient() {
  const sent = [];
  const client = createEngineClient((message) => sent.push(message));
  return { client, sent };
}

test("request posts a search with a monotonic id and resolves its result", async () => {
  const { client, sent } = recordingClient();
  const promise = client.request("startpos-fen", 2);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "search");
  assert.equal(sent[0].depth, 2);
  const id = sent[0].id;
  client.handle({ type: "result", id, move: "e4" });
  assert.equal(await promise, "e4");
});

test("a superseded search never resolves with a move", async () => {
  const { client, sent } = recordingClient();
  const stale = client.request("old-fen", 3); // id 1
  const fresh = client.request("new-fen", 3); // id 2 supersedes id 1
  const [first, second] = sent;

  // The worker answers the OLD search after it was superseded.
  client.handle({ type: "result", id: first.id, move: "Qh5" });
  assert.equal(await stale, null, "stale result must be dropped");

  client.handle({ type: "result", id: second.id, move: "Nf3" });
  assert.equal(await fresh, "Nf3", "current result still applies");
});

test("cancel settles any outstanding search as null", async () => {
  const { client } = recordingClient();
  const pending = client.request("fen", 2);
  client.cancel();
  assert.equal(await pending, null);
});

test("an engine error resolves as null rather than throwing", async () => {
  const { client, sent } = recordingClient();
  const promise = client.request("fen", 2);
  client.handle({ type: "error", id: sent[0].id, message: "boom" });
  assert.equal(await promise, null);
});

test("a result for an unknown id is ignored safely", () => {
  const { client } = recordingClient();
  assert.doesNotThrow(() => client.handle({ type: "result", id: 999, move: "e4" }));
});
