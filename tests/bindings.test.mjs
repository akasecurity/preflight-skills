import { test } from "node:test";
import assert from "node:assert/strict";
import { bindingFor, FAMILIES } from "../scripts/crew.mjs";

test("claude binding: read-only tools, stdin packet, role-default models", () => {
  const recall = bindingFor("claude", undefined, "recall", 600);
  assert.deepEqual(recall.argv, ["claude", "-p", "--model", "opus", "--allowedTools", "Read", "Grep", "Glob"]);
  assert.equal(recall.packetVia, "stdin");
  assert.equal(bindingFor("claude", undefined, "precision", 600).tune, "sonnet");
  assert.equal(bindingFor("claude", "haiku", "recall", 600).tune, "haiku");
});

test("openai binding: default read seat pins gpt-5.6-terra at medium effort", () => {
  const b = bindingFor("openai", undefined, "precision", 600);
  assert.deepEqual(b.argv, ["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-c", "model=gpt-5.6-terra", "-c", "model_reasoning_effort=medium", "-"]);
  assert.equal(b.tune, "gpt-5.6-terra@medium");
  assert.equal(b.packetVia, "stdin");
});

test("openai binding: default judge seat pins gpt-5.6-sol at low effort", () => {
  const b = bindingFor("openai", undefined, "judge", 600);
  assert.deepEqual(b.argv, ["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-c", "model=gpt-5.6-sol", "-c", "model_reasoning_effort=low", "-"]);
  assert.equal(b.tune, "gpt-5.6-sol@low");
});

test("openai binding: explicit effort tune overrides default effort, keeps default model", () => {
  const b = bindingFor("openai", "high", "precision", 600);
  assert.deepEqual(b.argv, ["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-c", "model=gpt-5.6-terra", "-c", "model_reasoning_effort=high", "-"]);
  assert.equal(b.tune, "gpt-5.6-terra@high");
});

test("openai binding: effort:model tune overrides both", () => {
  const b = bindingFor("openai", "high:gpt-6-preview", "precision", 600);
  assert.deepEqual(b.argv, ["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-c", "model=gpt-6-preview", "-c", "model_reasoning_effort=high", "-"]);
  assert.equal(b.tune, "gpt-6-preview@high");
});

test("google binding: agy sandbox, print-timeout matches seat, packet via file", () => {
  const b = bindingFor("google", undefined, "recall", 300);
  assert.deepEqual(b.argv, ["agy", "--sandbox", "--print-timeout", "300s", "-p"]);
  assert.equal(b.packetVia, "file");
  const pinned = bindingFor("google", "gemini-3-pro", "recall", 600);
  assert.deepEqual(pinned.argv, ["agy", "--sandbox", "--print-timeout", "600s", "--model", "gemini-3-pro", "-p"]);
});

test("unknown family returns undefined", () => {
  assert.equal(bindingFor("mistral", undefined, "recall", 600), undefined);
});

test("family-to-binary map", () => {
  assert.deepEqual(FAMILIES, { claude: "claude", openai: "codex", google: "agy" });
});

test("every family binding carries family + readOnly for telemetry", () => {
  const expected = {
    claude: "allowed-tools (Read/Grep/Glob)",
    openai: "sandbox read-only",
    google: "sandbox (terminal restrictions — not strict read-only)",
  };
  for (const [family, readOnly] of Object.entries(expected)) {
    const b = bindingFor(family, undefined, "recall", 600);
    assert.equal(b.family, family, `${family}: family field`);
    assert.equal(b.readOnly, readOnly, `${family}: readOnly field`);
  }
});
