import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseReads, TELLS_READ_BRIEF } from "../scripts/crew.mjs";

test("chooseReads: default is 3 × openai gpt-5.6-terra@medium with the neutral brief", () => {
  const r = chooseReads(new Set(["claude", "openai"]), {});
  assert.equal(r.ok, true);
  assert.equal(r.value.seats.length, 3);
  assert.deepEqual(r.value.seats.map((s) => s.tune), ["gpt-5.6-terra@medium", "gpt-5.6-terra@medium", "gpt-5.6-terra@medium"]);
  assert.deepEqual(r.value.seats.map((s) => s.role), ["read1", "read2", "read3"]);
  assert.equal(r.value.seats[0].brief, TELLS_READ_BRIEF);
  assert.equal(r.value.model, "openai:gpt-5.6-terra@medium");
});

test("chooseReads: --reads sets the count, --read overrides the model", () => {
  const r = chooseReads(new Set(["openai"]), { readSpec: "openai:high:gpt-5.6-terra", reads: 5 });
  assert.equal(r.value.seats.length, 5);
  assert.equal(r.value.seats[0].tune, "gpt-5.6-terra@high");
});

test("chooseReads: default family absent is a loud error", () => {
  const r = chooseReads(new Set(["claude"]), {});
  assert.equal(r.ok, false);
  assert.equal(r.exit, 1);
  assert.match(r.error, /codex/);
});
